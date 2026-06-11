import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Baseline,
  BaselineStatus,
  ParsedTestResult,
  Project,
  Recording,
  Result,
  Run,
  RunStatus,
} from "./types.js";

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS projects (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  url       TEXT NOT NULL,
  sheet_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature     TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status      TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  test_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL,
  error      TEXT,
  trace_path TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id);
CREATE INDEX IF NOT EXISTS idx_results_test ON results(test_id);

CREATE TABLE IF NOT EXISTS baselines (
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_id           TEXT NOT NULL,
  last_known_status TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, test_id)
);
`;

export class Db {
  readonly raw: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.raw = new Database(dbPath);
    this.raw.pragma("journal_mode = WAL");
    this.raw.pragma("foreign_keys = ON");
    this.raw.exec(SCHEMA);
  }

  close(): void {
    this.raw.close();
  }

  // ---- projects ----------------------------------------------------------

  createProject(name: string, url: string, sheetId?: string | null): Project {
    const info = this.raw
      .prepare(`INSERT INTO projects (name, url, sheet_id) VALUES (?, ?, ?)`)
      .run(name, url, sheetId ?? null);
    return this.getProject(Number(info.lastInsertRowid))!;
  }

  upsertProject(name: string, url: string, sheetId?: string | null): Project {
    const existing = this.getProjectByName(name);
    if (existing) {
      this.raw
        .prepare(`UPDATE projects SET url = ?, sheet_id = ? WHERE id = ?`)
        .run(url, sheetId ?? existing.sheet_id, existing.id);
      return this.getProject(existing.id)!;
    }
    return this.createProject(name, url, sheetId);
  }

  getProject(id: number): Project | undefined {
    return this.raw.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project | undefined;
  }

  getProjectByName(name: string): Project | undefined {
    return this.raw.prepare(`SELECT * FROM projects WHERE name = ?`).get(name) as
      | Project
      | undefined;
  }

  listProjects(): Project[] {
    return this.raw.prepare(`SELECT * FROM projects ORDER BY name`).all() as Project[];
  }

  deleteProject(id: number): void {
    this.raw.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  }

  // ---- recordings --------------------------------------------------------

  addRecording(projectId: number, name: string, path: string): Recording {
    const info = this.raw
      .prepare(
        `INSERT INTO recordings (project_id, name, path) VALUES (?, ?, ?)
         ON CONFLICT(project_id, name) DO UPDATE SET path = excluded.path`,
      )
      .run(projectId, name, path);
    const id = Number(info.lastInsertRowid);
    return (
      (this.raw.prepare(`SELECT * FROM recordings WHERE id = ?`).get(id) as Recording) ??
      (this.raw
        .prepare(`SELECT * FROM recordings WHERE project_id = ? AND name = ?`)
        .get(projectId, name) as Recording)
    );
  }

  listRecordings(projectId: number): Recording[] {
    return this.raw
      .prepare(`SELECT * FROM recordings WHERE project_id = ? ORDER BY created_at DESC`)
      .all(projectId) as Recording[];
  }

  // ---- runs --------------------------------------------------------------

  startRun(projectId: number, feature: string | null): Run {
    const info = this.raw
      .prepare(`INSERT INTO runs (project_id, feature) VALUES (?, ?)`)
      .run(projectId, feature);
    return this.getRun(Number(info.lastInsertRowid))!;
  }

  finishRun(runId: number, status: RunStatus): void {
    this.raw
      .prepare(`UPDATE runs SET status = ?, finished_at = datetime('now') WHERE id = ?`)
      .run(status, runId);
  }

  getRun(id: number): Run | undefined {
    return this.raw.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as Run | undefined;
  }

  listRuns(projectId: number, limit = 50): Run[] {
    return this.raw
      .prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?`)
      .all(projectId, limit) as Run[];
  }

  // ---- results -----------------------------------------------------------

  recordResult(runId: number, r: ParsedTestResult): void {
    this.raw
      .prepare(
        `INSERT INTO results (run_id, test_id, title, status, error, trace_path, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, r.testId, r.title, r.status, r.error, r.tracePath, r.durationMs);
  }

  listResults(runId: number): Result[] {
    return this.raw
      .prepare(`SELECT * FROM results WHERE run_id = ? ORDER BY id`)
      .all(runId) as Result[];
  }

  /** Latest known result per test for a project (most recent run wins). */
  latestResultsByTest(projectId: number): Map<string, Result> {
    const rows = this.raw
      .prepare(
        `SELECT r.* FROM results r
         JOIN runs ru ON ru.id = r.run_id
         WHERE ru.project_id = ?
         ORDER BY r.id DESC`,
      )
      .all(projectId) as Result[];
    const map = new Map<string, Result>();
    for (const row of rows) if (!map.has(row.test_id)) map.set(row.test_id, row);
    return map;
  }

  /** Status history for a single test (newest first), used for flaky detection. */
  statusHistory(projectId: number, testId: string, limit = 10): string[] {
    return (
      this.raw
        .prepare(
          `SELECT r.status FROM results r
           JOIN runs ru ON ru.id = r.run_id
           WHERE ru.project_id = ? AND r.test_id = ?
           ORDER BY r.id DESC LIMIT ?`,
        )
        .all(projectId, testId, limit) as { status: string }[]
    ).map((x) => x.status);
  }

  // ---- baselines ---------------------------------------------------------

  getBaseline(projectId: number, testId: string): Baseline | undefined {
    return this.raw
      .prepare(`SELECT * FROM baselines WHERE project_id = ? AND test_id = ?`)
      .get(projectId, testId) as Baseline | undefined;
  }

  listBaselines(projectId: number): Baseline[] {
    return this.raw
      .prepare(`SELECT * FROM baselines WHERE project_id = ?`)
      .all(projectId) as Baseline[];
  }

  setBaseline(projectId: number, testId: string, status: BaselineStatus): void {
    this.raw
      .prepare(
        `INSERT INTO baselines (project_id, test_id, last_known_status, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, test_id)
         DO UPDATE SET last_known_status = excluded.last_known_status, updated_at = datetime('now')`,
      )
      .run(projectId, testId, status);
  }
}

let _db: Db | null = null;

/** Process-wide singleton, opened lazily against the given path. */
export function openDb(dbPath: string): Db {
  if (!_db) _db = new Db(dbPath);
  return _db;
}
