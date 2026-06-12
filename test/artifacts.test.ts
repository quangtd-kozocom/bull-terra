import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanProjectArtifacts, deleteRunArtifacts, deleteRunHistory, projectArtifactStats } from "../src/core/artifacts.js";
import { Db } from "../src/core/db.js";
import { projectPaths, runArtifactsDir, type ProjectPaths } from "../src/core/paths.js";
import type { ParsedTestResult, Project } from "../src/core/types.js";

function result(testId: string, tracePath: string | null, videoPath: string | null): ParsedTestResult {
  return { testId, title: testId, feature: "f", status: "failed", error: "boom", tracePath, videoPath, durationMs: 10 };
}

describe("run artifact management", () => {
  let dir: string;
  let paths: ProjectPaths;
  let db: Db;
  let project: Project;
  let envId: number;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-artifacts-"));
    paths = projectPaths(dir);
    db = new Db(":memory:");
    project = db.createProject("app");
    envId = db.upsertEnvironment(project.id, "stg", "https://stg.x").id;
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** A finished run with files in the NEW layout (recordings/app/.runs/run-<id>/). */
  function newLayoutRun(bytes: number): number {
    const run = db.startRun(project.id, envId, null);
    const artifactDir = runArtifactsDir(paths, project.name, run.id);
    mkdirSync(join(artifactDir, "case"), { recursive: true });
    writeFileSync(join(artifactDir, "case", "video.webm"), Buffer.alloc(bytes));
    db.recordResult(
      run.id,
      result("a", null, `recordings/app/.runs/run-${run.id}/case/video.webm`),
    );
    db.finishRun(run.id, "failed");
    return run.id;
  }

  /** A finished run with a loose file in the LEGACY layout (test-results/). */
  function legacyLayoutRun(bytes: number): number {
    const run = db.startRun(project.id, envId, null);
    const file = join(paths.tracesDir, `case-${run.id}`, "test-failed-1.png");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(bytes));
    db.recordResult(run.id, result("a", `test-results/case-${run.id}/test-failed-1.png`, null));
    db.finishRun(run.id, "failed");
    return run.id;
  }

  it("reports per-run and total sizes across both layouts", () => {
    const newer = newLayoutRun(2048);
    const older = legacyLayoutRun(1024);
    const stats = projectArtifactStats(db, paths, project);
    expect(stats.byRun[newer]).toBe(2048);
    expect(stats.byRun[older]).toBe(1024);
    expect(stats.totalBytes).toBe(3072);
  });

  it("deletes one run's files and nulls its artifact links", () => {
    const runId = newLayoutRun(2048);
    const freed = deleteRunArtifacts(db, paths, project, runId);
    expect(freed).toBe(2048);
    expect(existsSync(runArtifactsDir(paths, project.name, runId))).toBe(false);
    expect(db.listResults(runId)[0]).toMatchObject({ trace_path: null, video_path: null });
    // The run row itself survives for history.
    expect(db.getRun(runId)?.status).toBe("failed");
  });

  it("deletes legacy loose files too", () => {
    const runId = legacyLayoutRun(1024);
    expect(deleteRunArtifacts(db, paths, project, runId)).toBe(1024);
    expect(projectArtifactStats(db, paths, project).totalBytes).toBe(0);
  });

  it("counts a legacy file shared by several runs once, and clears every link on delete", () => {
    // Two runs whose results reference the SAME legacy file (pre-.runs layout
    // overwrote the same folder each run).
    const shared = join(paths.tracesDir, "case", "test-failed-1.png");
    mkdirSync(dirname(shared), { recursive: true });
    writeFileSync(shared, Buffer.alloc(512));
    const mkRun = () => {
      const run = db.startRun(project.id, envId, null);
      db.recordResult(run.id, result("a", "test-results/case/test-failed-1.png", null));
      db.finishRun(run.id, "failed");
      return run.id;
    };
    const older = mkRun();
    const newer = mkRun();

    const stats = projectArtifactStats(db, paths, project);
    expect(stats.totalBytes).toBe(512); // not 1024 — shared file counted once
    expect(stats.byRun[newer]).toBe(512); // attributed to the newest run
    expect(stats.byRun[older]).toBeUndefined();

    expect(deleteRunArtifacts(db, paths, project, older)).toBe(512);
    // Both runs' links are cleared — no dangling artifact links remain.
    expect(db.listResults(older)[0].trace_path).toBeNull();
    expect(db.listResults(newer)[0].trace_path).toBeNull();
  });

  it("cleanProjectArtifacts keeps the newest N runs", () => {
    const first = newLayoutRun(100);
    const second = newLayoutRun(200);
    const third = newLayoutRun(300);
    const { freedBytes, deletedRuns } = cleanProjectArtifacts(db, paths, project, 1);
    expect(deletedRuns).toBe(2);
    expect(freedBytes).toBe(300); // first + second
    const stats = projectArtifactStats(db, paths, project);
    expect(Object.keys(stats.byRun).map(Number)).toEqual([third]);
    expect(stats.byRun[first]).toBeUndefined();
    expect(stats.byRun[second]).toBeUndefined();
  });

  it("keep=0 wipes everything including the .runs dir", () => {
    newLayoutRun(100);
    newLayoutRun(200);
    cleanProjectArtifacts(db, paths, project, 0);
    expect(projectArtifactStats(db, paths, project).totalBytes).toBe(0);
    expect(existsSync(join(paths.recordingsDir, "app", ".runs"))).toBe(false);
  });

  describe("deleteRunHistory", () => {
    it("erases the selected runs entirely — files, results and the run rows", () => {
      const keep = newLayoutRun(100);
      const drop = newLayoutRun(200);

      const { freedBytes, deletedRuns } = deleteRunHistory(db, paths, project, [drop]);
      expect(freedBytes).toBe(200);
      expect(deletedRuns).toBe(1);
      // The dropped run is gone — row, results and files.
      expect(db.getRun(drop)).toBeUndefined();
      expect(db.listResults(drop)).toHaveLength(0);
      expect(existsSync(runArtifactsDir(paths, project.name, drop))).toBe(false);
      // The other run is untouched.
      expect(db.getRun(keep)?.status).toBe("failed");
      expect(db.listResults(keep)).toHaveLength(1);
    });

    it("removes the .runs dir once the last run is erased", () => {
      const a = newLayoutRun(100);
      const b = newLayoutRun(200);
      deleteRunHistory(db, paths, project, [a, b]);
      expect(db.listRuns(project.id).length).toBe(0);
      expect(existsSync(join(paths.recordingsDir, "app", ".runs"))).toBe(false);
    });
  });

  describe("listScreencasts", () => {
    it("returns only video results, newest first, with run context", () => {
      const first = db.startRun(project.id, envId, "checkout");
      db.recordResult(first.id, result("a", null, "recordings/app/.runs/run-1/a.webm"));
      db.recordResult(first.id, result("b", "recordings/app/.runs/run-1/b.png", null)); // no video
      db.finishRun(first.id, "failed");
      const second = db.startRun(project.id, envId, null);
      db.recordResult(second.id, result("c", null, "recordings/app/.runs/run-2/c.webm"));
      db.finishRun(second.id, "passed");

      const casts = db.listScreencasts(project.id, envId);
      expect(casts.map((c) => c.testId)).toEqual(["c", "a"]); // newest first, png skipped
      expect(casts[0]).toMatchObject({ runId: second.id, feature: null, videoPath: "recordings/app/.runs/run-2/c.webm" });
      expect(casts[1]).toMatchObject({ runId: first.id, feature: "checkout" });
    });

    it("scopes screencasts to the environment", () => {
      const other = db.upsertEnvironment(project.id, "local", "http://localhost").id;
      const run = db.startRun(project.id, envId, null);
      db.recordResult(run.id, result("a", null, "recordings/app/.runs/run-1/a.webm"));
      db.finishRun(run.id, "passed");
      expect(db.listScreencasts(project.id, other)).toHaveLength(0);
    });
  });
});
