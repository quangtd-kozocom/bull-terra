import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Db } from "./db.js";
import { runArtifactsDir, projectRecordingsDir, type ProjectPaths } from "./paths.js";
import type { Project } from "./types.js";

/**
 * Run-artifact bookkeeping: screenshots/videos/traces accumulate fast, so the
 * dashboard and `bull-terra clean` need per-run sizes and safe deletion. Covers
 * both eras: recordings/<project>/.runs/run-<id>/ (current) and loose files
 * under test-results/ (runs recorded before the per-project layout).
 */

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

/** Guard for unlinking: only known artifact locations are ever deleted. */
function isArtifactFile(paths: ProjectPaths, abs: string): boolean {
  return (
    abs.startsWith(paths.tracesDir + sep) ||
    (abs.startsWith(paths.recordingsDir + sep) && abs.includes(`${sep}.runs${sep}`))
  );
}

/**
 * Legacy loose artifact files (under test-results/) referenced by one run's
 * results, as [absolute, root-relative] pairs. Pre-.runs layouts overwrote the
 * same folder every run, so the SAME file may be referenced by several runs.
 */
function legacyArtifactFiles(db: Db, paths: ProjectPaths, runId: number): [string, string][] {
  const files: [string, string][] = [];
  for (const r of db.listResults(runId)) {
    for (const rel of [r.trace_path, r.video_path]) {
      if (!rel) continue;
      const abs = resolve(paths.root, rel);
      if (abs.startsWith(paths.tracesDir + sep) && existsSync(abs)) files.push([abs, rel]);
    }
  }
  return files;
}

export interface ProjectArtifactStats {
  totalBytes: number;
  /** Bytes on disk per run id; runs without artifacts are absent. */
  byRun: Record<number, number>;
}

export function projectArtifactStats(db: Db, paths: ProjectPaths, project: Project): ProjectArtifactStats {
  const byRun: Record<number, number> = {};
  const counted = new Set<string>(); // legacy files shared across runs count once, on the newest run
  for (const run of db.listRuns(project.id, undefined, 10_000)) {
    let size = dirSize(runArtifactsDir(paths, project.name, run.id));
    for (const [abs] of legacyArtifactFiles(db, paths, run.id)) {
      if (counted.has(abs)) continue;
      counted.add(abs);
      size += statSync(abs).size;
    }
    if (size > 0) byRun[run.id] = size;
  }
  return { totalBytes: Object.values(byRun).reduce((a, b) => a + b, 0), byRun };
}

/**
 * Delete one run's artifacts from disk and null the DB pointers so the
 * dashboard stops offering dead links — including links from OTHER runs that
 * shared the same legacy file. Returns bytes freed.
 */
export function deleteRunArtifacts(db: Db, paths: ProjectPaths, project: Project, runId: number): number {
  const dir = runArtifactsDir(paths, project.name, runId);
  let freed = dirSize(dir);
  rmSync(dir, { recursive: true, force: true });
  const deletedRels: string[] = [];
  for (const [abs, rel] of legacyArtifactFiles(db, paths, runId)) {
    if (!isArtifactFile(paths, abs)) continue;
    freed += statSync(abs).size;
    unlinkSync(abs);
    deletedRels.push(rel);
  }
  db.clearRunArtifacts(runId);
  db.clearArtifactPathRefs(deletedRels);
  return freed;
}

/**
 * Erase runs from history entirely: artifacts on disk, then the run rows and
 * their results. Unlike deleteRunArtifacts, nothing of the run survives —
 * baselines stay, so regression detection keeps its "last known status".
 */
export function deleteRunHistory(
  db: Db,
  paths: ProjectPaths,
  project: Project,
  runIds: number[],
): { freedBytes: number; deletedRuns: number } {
  let freedBytes = 0;
  for (const runId of runIds) {
    freedBytes += deleteRunArtifacts(db, paths, project, runId);
    db.deleteRun(runId);
  }
  if (db.listRuns(project.id, undefined, 1).length === 0) {
    rmSync(join(projectRecordingsDir(paths, project.name), ".runs"), { recursive: true, force: true });
  }
  return { freedBytes, deletedRuns: runIds.length };
}

/**
 * Delete artifacts for all of a project's runs except the newest `keep`.
 * keep=0 wipes everything (including the now-empty .runs dir).
 */
export function cleanProjectArtifacts(
  db: Db,
  paths: ProjectPaths,
  project: Project,
  keep = 0,
): { freedBytes: number; deletedRuns: number } {
  const runs = db.listRuns(project.id, undefined, 10_000); // newest first
  let freedBytes = 0;
  let deletedRuns = 0;
  for (const run of runs.slice(keep)) {
    const freed = deleteRunArtifacts(db, paths, project, run.id);
    if (freed > 0) {
      freedBytes += freed;
      deletedRuns++;
    }
  }
  if (keep === 0) {
    rmSync(join(projectRecordingsDir(paths, project.name), ".runs"), { recursive: true, force: true });
  }
  return { freedBytes, deletedRuns };
}
