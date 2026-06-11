import type Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { BaselineStatus, RunStatus, TestStatus } from "./types.js";

// Drizzle table definitions — the single source of truth for typed queries.
// JS keys deliberately mirror the snake_case columns so a selected row IS the
// domain shape (Environment, Run, …) with no remapping layer.

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const environments = sqliteTable("environments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  // KEY -> .env variable NAME (e.g. {USER:"APP_A_STG_USER"}). Names only — never
  // the secret values. Injected at run time as BULL_TERRA_<KEY>.
  secret_vars: text("secret_vars", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  is_default: integer("is_default").notNull().default(0).$type<0 | 1>(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const features = sqliteTable("features", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id").notNull(),
  name: text("name").notNull(),
  sheet_id: text("sheet_id"),
  start_path: text("start_path").notNull().default("/"),
  requires_auth: integer("requires_auth").notNull().default(0).$type<0 | 1>(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id").notNull(),
  feature_id: integer("feature_id"),
  name: text("name").notNull(),
  path: text("path").notNull(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id").notNull(),
  env_id: integer("env_id").notNull(),
  feature: text("feature"),
  started_at: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  finished_at: text("finished_at"),
  status: text("status").notNull().default("running").$type<RunStatus>(),
});

export const results = sqliteTable("results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  run_id: integer("run_id").notNull(),
  test_id: text("test_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().$type<TestStatus>(),
  error: text("error"),
  trace_path: text("trace_path"),
  duration_ms: integer("duration_ms"),
});

export const baselines = sqliteTable(
  "baselines",
  {
    project_id: integer("project_id").notNull(),
    env_id: integer("env_id").notNull(),
    test_id: text("test_id").notNull(),
    last_known_status: text("last_known_status").notNull().$type<BaselineStatus>(),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.project_id, t.env_id, t.test_id] })],
);

export const schema = { projects, environments, features, recordings, runs, results, baselines };

/**
 * Runtime DDL, kept in lockstep with the Drizzle tables above. bull-terra ships
 * as a CLI with no migration files, so the DB is materialized on the user's box
 * at first run via these idempotent CREATE TABLE IF NOT EXISTS statements.
 */
export const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS projects (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A deploy target the same app lives on (local / dev / stg / prod).
-- secret_vars is a JSON map of KEY -> .env var NAME holding this env's secrets.
CREATE TABLE IF NOT EXISTS environments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  secret_vars TEXT NOT NULL DEFAULT '{}',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

-- A feature == one Google Sheet of test cases (1:1).
CREATE TABLE IF NOT EXISTS features (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sheet_id   TEXT,
  start_path TEXT NOT NULL DEFAULT '/',
  requires_auth INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS recordings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_id INTEGER REFERENCES features(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, feature_id, name)
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

/**
 * One-shot, idempotent backfill from the legacy user_var/pass_var columns to the
 * secret_vars JSON map. Runs every startup but no-ops once the old columns are
 * gone, so existing installs upgrade in place with zero user action.
 */
export function migrateLegacyCredVars(sqlite: Database.Database): void {
  const cols = sqlite.prepare(`PRAGMA table_info(environments)`).all() as { name: string }[];
  const names = new Set(cols.map((col) => col.name));
  if (!names.has("user_var") && !names.has("pass_var")) return; // already on secret_vars

  const tx = sqlite.transaction(() => {
    if (!names.has("secret_vars")) {
      sqlite.exec(`ALTER TABLE environments ADD COLUMN secret_vars TEXT NOT NULL DEFAULT '{}'`);
    }
    const rows = sqlite
      .prepare(`SELECT id, user_var, pass_var FROM environments`)
      .all() as { id: number; user_var: string | null; pass_var: string | null }[];
    const update = sqlite.prepare(`UPDATE environments SET secret_vars = ? WHERE id = ?`);
    for (const row of rows) {
      const map: Record<string, string> = {};
      if (row.user_var) map.USER = row.user_var;
      if (row.pass_var) map.PASS = row.pass_var;
      update.run(JSON.stringify(map), row.id);
    }
    sqlite.exec(`ALTER TABLE environments DROP COLUMN user_var`);
    sqlite.exec(`ALTER TABLE environments DROP COLUMN pass_var`);
  });
  tx();
}

/**
 * Existing installs used project-level recordings with UNIQUE(project_id, name).
 * Rebuild the table once so recordings can be scoped to features while old rows
 * remain unassigned/shared with feature_id = NULL.
 */
export function migrateFeatureScopedRecordings(sqlite: Database.Database): void {
  const cols = sqlite.prepare(`PRAGMA table_info(recordings)`).all() as { name: string }[];
  if (cols.length === 0 || cols.some((col) => col.name === "feature_id")) return;

  const tx = sqlite.transaction(() => {
    sqlite.exec(/* sql */ `
      ALTER TABLE recordings RENAME TO recordings_legacy;
      CREATE TABLE recordings (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        feature_id INTEGER REFERENCES features(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        path       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, feature_id, name)
      );
      INSERT INTO recordings (id, project_id, feature_id, name, path, created_at)
        SELECT id, project_id, NULL, name, path, created_at FROM recordings_legacy;
      DROP TABLE recordings_legacy;
    `);
  });
  tx();
}

export function migrateFeatureRecordingOptions(sqlite: Database.Database): void {
  const cols = sqlite.prepare(`PRAGMA table_info(features)`).all() as { name: string }[];
  const names = new Set(cols.map((col) => col.name));
  const tx = sqlite.transaction(() => {
    if (!names.has("start_path")) {
      sqlite.exec(`ALTER TABLE features ADD COLUMN start_path TEXT NOT NULL DEFAULT '/'`);
    }
    if (!names.has("requires_auth")) {
      sqlite.exec(`ALTER TABLE features ADD COLUMN requires_auth INTEGER NOT NULL DEFAULT 0`);
    }
  });
  tx();
}
