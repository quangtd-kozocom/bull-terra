import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Baseline,
  BaselineStatus,
  Environment,
  Feature,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A deploy target the same app lives on (local / dev / stg / prod).
-- user_var / pass_var name the .env vars that hold this env's login secrets.
CREATE TABLE IF NOT EXISTS environments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  user_var   TEXT,
  pass_var   TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

-- A feature == one Google Sheet of test cases (1:1).
CREATE TABLE IF NOT EXISTS features (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sheet_id   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
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
  env_id      INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
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

-- Baselines are per (project, env, test): "green on stg" is independent of "green on local".
CREATE TABLE IF NOT EXISTS baselines (
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env_id            INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  test_id           TEXT NOT NULL,
  last_known_status TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, env_id, test_id)
);
`;

export class Db {
  readonly raw: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.raw = new Database(dbPath);
    this.raw.pragma("journal_mode = WAL");
    this.raw.pragma("foreign_keys = ON");
    this.raw.exec(SCHEMA);
  }

  close(): void {
    this.raw.close();
  }

  // ---- projects ----------------------------------------------------------

  createProject(name: string): Project {
    const info = this.raw.prepare(`INSERT INTO projects (name) VALUES (?)`).run(name);
    return this.getProject(Number(info.lastInsertRowid))!;
  }

  /** Create the project if missing; otherwise return the existing one (name is the identity). */
  upsertProject(name: string): Project {
    return this.getProjectByName(name) ?? this.createProject(name);
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

  renameProject(id: number, name: string): Project {
    this.raw.prepare(`UPDATE projects SET name = ? WHERE id = ?`).run(name, id);
    return this.getProject(id)!;
  }

  // ---- environments ------------------------------------------------------

  upsertEnvironment(
    projectId: number,
    name: string,
    url: string,
    opts: { userVar?: string | null; passVar?: string | null; isDefault?: boolean } = {},
  ): Environment {
    const existing = this.getEnvironment(projectId, name);
    if (existing) {
      this.raw
        .prepare(`UPDATE environments SET url = ?, user_var = ?, pass_var = ? WHERE id = ?`)
        .run(url, opts.userVar ?? existing.user_var, opts.passVar ?? existing.pass_var, existing.id);
      if (opts.isDefault) this.setDefaultEnvironment(projectId, existing.id);
      return this.getEnvironmentById(existing.id)!;
    }
    const info = this.raw
      .prepare(
        `INSERT INTO environments (project_id, name, url, user_var, pass_var) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectId, name, url, opts.userVar ?? null, opts.passVar ?? null);
    const id = Number(info.lastInsertRowid);
    // First env for a project is the default; or honor an explicit request.
    const count = (
      this.raw.prepare(`SELECT COUNT(*) n FROM environments WHERE project_id = ?`).get(projectId) as {
        n: number;
      }
    ).n;
    if (opts.isDefault || count === 1) this.setDefaultEnvironment(projectId, id);
    return this.getEnvironmentById(id)!;
  }

  getEnvironmentById(id: number): Environment | undefined {
    return this.raw.prepare(`SELECT * FROM environments WHERE id = ?`).get(id) as
      | Environment
      | undefined;
  }

  getEnvironment(projectId: number, name: string): Environment | undefined {
    return this.raw
      .prepare(`SELECT * FROM environments WHERE project_id = ? AND name = ?`)
      .get(projectId, name) as Environment | undefined;
  }

  listEnvironments(projectId: number): Environment[] {
    return this.raw
      .prepare(`SELECT * FROM environments WHERE project_id = ? ORDER BY is_default DESC, name`)
      .all(projectId) as Environment[];
  }

  getDefaultEnvironment(projectId: number): Environment | undefined {
    return (
      (this.raw
        .prepare(`SELECT * FROM environments WHERE project_id = ? AND is_default = 1`)
        .get(projectId) as Environment | undefined) ??
      (this.raw
        .prepare(`SELECT * FROM environments WHERE project_id = ? ORDER BY id LIMIT 1`)
        .get(projectId) as Environment | undefined)
    );
  }

  setDefaultEnvironment(projectId: number, envId: number): void {
    const tx = this.raw.transaction(() => {
      this.raw.prepare(`UPDATE environments SET is_default = 0 WHERE project_id = ?`).run(projectId);
      this.raw
        .prepare(`UPDATE environments SET is_default = 1 WHERE id = ? AND project_id = ?`)
        .run(envId, projectId);
    });
    tx();
  }

  deleteEnvironment(projectId: number, name: string): boolean {
    const env = this.getEnvironment(projectId, name);
    if (!env) return false;
    const wasDefault = env.is_default === 1;
    this.raw.prepare(`DELETE FROM environments WHERE id = ?`).run(env.id);
    // Promote another env to default if we removed the default one.
    if (wasDefault) {
      const next = this.raw
        .prepare(`SELECT id FROM environments WHERE project_id = ? ORDER BY id LIMIT 1`)
        .get(projectId) as { id: number } | undefined;
      if (next) this.setDefaultEnvironment(projectId, next.id);
    }
    return true;
  }

  updateEnvironment(
    projectId: number,
    currentName: string,
    next: { name: string; url: string; userVar?: string | null; passVar?: string | null },
  ): Environment | undefined {
    const existing = this.getEnvironment(projectId, currentName);
    if (!existing) return undefined;
    this.raw
      .prepare(`UPDATE environments SET name = ?, url = ?, user_var = ?, pass_var = ? WHERE id = ?`)
      .run(next.name, next.url, next.userVar ?? null, next.passVar ?? null, existing.id);
    return this.getEnvironmentById(existing.id);
  }

  // ---- features ----------------------------------------------------------

  upsertFeature(projectId: number, name: string, sheetId?: string | null): Feature {
    const existing = this.getFeature(projectId, name);
    if (existing) {
      this.raw
        .prepare(`UPDATE features SET sheet_id = ? WHERE id = ?`)
        .run(sheetId ?? existing.sheet_id, existing.id);
      return this.getFeatureById(existing.id)!;
    }
    const info = this.raw
      .prepare(`INSERT INTO features (project_id, name, sheet_id) VALUES (?, ?, ?)`)
      .run(projectId, name, sheetId ?? null);
    return this.getFeatureById(Number(info.lastInsertRowid))!;
  }

  getFeatureById(id: number): Feature | undefined {
    return this.raw.prepare(`SELECT * FROM features WHERE id = ?`).get(id) as Feature | undefined;
  }

  getFeature(projectId: number, name: string): Feature | undefined {
    return this.raw
      .prepare(`SELECT * FROM features WHERE project_id = ? AND name = ?`)
      .get(projectId, name) as Feature | undefined;
  }

  listFeatures(projectId: number): Feature[] {
    return this.raw
      .prepare(`SELECT * FROM features WHERE project_id = ? ORDER BY name`)
      .all(projectId) as Feature[];
  }

  deleteFeature(projectId: number, name: string): boolean {
    const info = this.raw
      .prepare(`DELETE FROM features WHERE project_id = ? AND name = ?`)
      .run(projectId, name);
    return info.changes > 0;
  }

  updateFeature(
    projectId: number,
    currentName: string,
    next: { name: string; sheetId?: string | null },
  ): Feature | undefined {
    const existing = this.getFeature(projectId, currentName);
    if (!existing) return undefined;
    const tx = this.raw.transaction(() => {
      this.raw
        .prepare(`UPDATE features SET name = ?, sheet_id = ? WHERE id = ?`)
        .run(next.name, next.sheetId ?? null, existing.id);
      this.raw
        .prepare(`UPDATE runs SET feature = ? WHERE project_id = ? AND feature = ?`)
        .run(next.name, projectId, currentName);

      const oldPrefix = `${currentName}.spec.ts>`;
      const newPrefix = `${next.name}.spec.ts>`;
      this.raw
        .prepare(
          `UPDATE results
           SET test_id = ? || substr(test_id, ? + 1)
           WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)
             AND substr(test_id, 1, ?) = ?`,
        )
        .run(newPrefix, oldPrefix.length, projectId, oldPrefix.length, oldPrefix);
      this.raw
        .prepare(
          `UPDATE baselines
           SET test_id = ? || substr(test_id, ? + 1)
           WHERE project_id = ? AND substr(test_id, 1, ?) = ?`,
        )
        .run(newPrefix, oldPrefix.length, projectId, oldPrefix.length, oldPrefix);
    });
    tx();
    return this.getFeatureById(existing.id);
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

  startRun(projectId: number, envId: number, feature: string | null): Run {
    const info = this.raw
      .prepare(`INSERT INTO runs (project_id, env_id, feature) VALUES (?, ?, ?)`)
      .run(projectId, envId, feature);
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

  listRuns(projectId: number, envId?: number, limit = 50): Run[] {
    if (envId != null)
      return this.raw
        .prepare(
          `SELECT * FROM runs WHERE project_id = ? AND env_id = ? ORDER BY started_at DESC LIMIT ?`,
        )
        .all(projectId, envId, limit) as Run[];
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

  /** Latest known result per test for a project+env (most recent run wins). */
  latestResultsByTest(projectId: number, envId: number): Map<string, Result> {
    const rows = this.raw
      .prepare(
        `SELECT r.* FROM results r
         JOIN runs ru ON ru.id = r.run_id
         WHERE ru.project_id = ? AND ru.env_id = ?
         ORDER BY r.id DESC`,
      )
      .all(projectId, envId) as Result[];
    const map = new Map<string, Result>();
    for (const row of rows) if (!map.has(row.test_id)) map.set(row.test_id, row);
    return map;
  }

  /** Status history for a single test on one env (newest first), used for flaky detection. */
  statusHistory(projectId: number, envId: number, testId: string, limit = 10): string[] {
    return (
      this.raw
        .prepare(
          `SELECT r.status FROM results r
           JOIN runs ru ON ru.id = r.run_id
           WHERE ru.project_id = ? AND ru.env_id = ? AND r.test_id = ?
           ORDER BY r.id DESC LIMIT ?`,
        )
        .all(projectId, envId, testId, limit) as { status: string }[]
    ).map((x) => x.status);
  }

  // ---- baselines ---------------------------------------------------------

  getBaseline(projectId: number, envId: number, testId: string): Baseline | undefined {
    return this.raw
      .prepare(`SELECT * FROM baselines WHERE project_id = ? AND env_id = ? AND test_id = ?`)
      .get(projectId, envId, testId) as Baseline | undefined;
  }

  listBaselines(projectId: number, envId: number): Baseline[] {
    return this.raw
      .prepare(`SELECT * FROM baselines WHERE project_id = ? AND env_id = ?`)
      .all(projectId, envId) as Baseline[];
  }

  setBaseline(projectId: number, envId: number, testId: string, status: BaselineStatus): void {
    this.raw
      .prepare(
        `INSERT INTO baselines (project_id, env_id, test_id, last_known_status, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, env_id, test_id)
         DO UPDATE SET last_known_status = excluded.last_known_status, updated_at = datetime('now')`,
      )
      .run(projectId, envId, testId, status);
  }
}

let _db: Db | null = null;

/** Process-wide singleton, opened lazily against the given path. */
export function openDb(dbPath: string): Db {
  if (!_db) _db = new Db(dbPath);
  return _db;
}
