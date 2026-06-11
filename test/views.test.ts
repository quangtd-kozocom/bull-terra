import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/core/db.js";
import { projectPaths } from "../src/core/paths.js";
import type { ParsedTestResult, TestStatus } from "../src/core/types.js";
import { buildProjectView } from "../src/server/views.js";

const SPEC = `import { test, expect } from "@playwright/test";

test('TC-01: stable test', async () => {});
test('TC-02: flip-flopping test', async () => {});
`;

describe("buildProjectView test history", () => {
  let root: string;
  let db: Db;
  let projectId: number;
  let envId: number;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "bull-terra-views-"));
    mkdirSync(join(root, "tests", "gen", "app"), { recursive: true });
    writeFileSync(join(root, "tests", "gen", "app", "checkout.spec.ts"), SPEC);
    db = new Db(":memory:");
    projectId = db.createProject("app").id;
    envId = db.upsertEnvironment(projectId, "stg", "https://stg.x").id;
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function run(statusByTitle: Record<string, TestStatus>) {
    const r = db.startRun(projectId, envId, "checkout");
    for (const [title, status] of Object.entries(statusByTitle)) {
      const result: ParsedTestResult = {
        testId: `checkout.spec.ts>${title}`,
        title,
        feature: "checkout",
        status,
        error: status === "passed" ? null : "boom",
        tracePath: null,
        durationMs: 25,
      };
      db.recordResult(r.id, result);
    }
    db.finishRun(r.id, "passed");
  }

  it("attaches per-test history (newest first) and flags gate-quarantined tests as flaky", () => {
    const statuses: TestStatus[] = ["passed", "failed", "passed", "failed"];
    for (const s of statuses) {
      run({ "TC-01: stable test": "passed", "TC-02: flip-flopping test": s });
    }

    const view = buildProjectView(db, projectPaths(root), db.getProject(projectId)!);
    const tests = view.features.find((f) => f.feature === "checkout")!.tests;
    const stable = tests.find((t) => t.tcId === "TC-01")!;
    const flippy = tests.find((t) => t.tcId === "TC-02")!;

    expect(stable.history.map((h) => h.status)).toEqual(["passed", "passed", "passed", "passed"]);
    expect(stable.flaky).toBe(false);
    // Newest first: the last run's "failed" leads.
    expect(flippy.history.map((h) => h.status)).toEqual(["failed", "passed", "failed", "passed"]);
    expect(flippy.flaky).toBe(true);
    expect(flippy.history[0].durationMs).toBe(25);
  });

  it("summarizes recent runs with tallies", () => {
    run({ "TC-01: stable test": "passed", "TC-02: flip-flopping test": "failed" });
    const view = buildProjectView(db, projectPaths(root), db.getProject(projectId)!);
    expect(view.recentRuns).toHaveLength(1);
    expect(view.recentRuns[0]).toMatchObject({
      feature: "checkout",
      passed: 1,
      failed: 1,
      duration_ms: 50,
    });
  });

  it("yields empty history and no flaky flag before any run", () => {
    const view = buildProjectView(db, projectPaths(root), db.getProject(projectId)!);
    const test = view.features[0].tests[0];
    expect(test.history).toEqual([]);
    expect(test.flaky).toBe(false);
    expect(view.recentRuns).toEqual([]);
  });
});
