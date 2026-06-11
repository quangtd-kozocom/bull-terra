import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/core/db.js";
import { buildRunEnv } from "../src/core/engine.js";
import { projectPaths } from "../src/core/paths.js";
import { normalizeKey, normalizeSecretVars, parseVarFlag } from "../src/core/secret-vars.js";
import type { Environment, Project } from "../src/core/types.js";

describe("environment secret_vars", () => {
  let db: Db;
  let projectId: number;

  beforeEach(() => {
    db = new Db(":memory:");
    projectId = db.createProject("app").id;
  });

  it("merges on upsert (omitted keys are kept)", () => {
    db.upsertEnvironment(projectId, "stg", "https://stg.x", {
      secretVars: { USER: "APP_USER", PASS: "APP_PASS" },
    });
    const env = db.upsertEnvironment(projectId, "stg", "https://stg.x", {
      secretVars: { API_KEY: "APP_KEY" },
    });
    expect(env.secret_vars).toEqual({ USER: "APP_USER", PASS: "APP_PASS", API_KEY: "APP_KEY" });
  });

  it("overwrites an existing key without touching the others", () => {
    db.upsertEnvironment(projectId, "stg", "https://stg.x", {
      secretVars: { USER: "OLD", PASS: "APP_PASS" },
    });
    const env = db.upsertEnvironment(projectId, "stg", "https://stg.x", {
      secretVars: { USER: "NEW" },
    });
    expect(env.secret_vars).toEqual({ USER: "NEW", PASS: "APP_PASS" });
  });

  it("removes a key via unset", () => {
    db.upsertEnvironment(projectId, "stg", "https://stg.x", {
      secretVars: { USER: "APP_USER", PASS: "APP_PASS", API_KEY: "APP_KEY" },
    });
    const env = db.upsertEnvironment(projectId, "stg", "https://stg.x", { unset: ["API_KEY"] });
    expect(env.secret_vars).toEqual({ USER: "APP_USER", PASS: "APP_PASS" });
  });

  it("updateEnvironment replaces the whole map", () => {
    db.upsertEnvironment(projectId, "stg", "https://stg.x", {
      secretVars: { USER: "APP_USER", PASS: "APP_PASS" },
    });
    const env = db.updateEnvironment(projectId, "stg", {
      name: "stg",
      url: "https://stg.x",
      secretVars: { API_KEY: "APP_KEY" },
    });
    expect(env?.secret_vars).toEqual({ API_KEY: "APP_KEY" });
  });

  it("defaults to an empty map for an unauthenticated env", () => {
    const env = db.upsertEnvironment(projectId, "stg", "https://stg.x");
    expect(env.secret_vars).toEqual({});
  });
});

describe("key + flag validation", () => {
  it("uppercases valid keys", () => {
    expect(normalizeKey("api_key")).toBe("API_KEY");
  });

  it("rejects invalid keys", () => {
    expect(() => normalizeKey("api-key")).toThrow(/Invalid secret-var key/);
    expect(() => normalizeKey("2fa")).toThrow();
    expect(() => normalizeKey("my key")).toThrow();
  });

  it("parses KEY=NAME flag specs", () => {
    expect(parseVarFlag("api_key=APP_KEY")).toEqual(["API_KEY", "APP_KEY"]);
  });

  it("rejects malformed flag specs", () => {
    expect(() => parseVarFlag("APP_KEY")).toThrow(/Expected KEY=ENV_VAR_NAME/);
    expect(() => parseVarFlag("API_KEY=")).toThrow(/missing the .env variable name/);
  });

  it("normalizeSecretVars uppercases keys and drops blank values", () => {
    expect(normalizeSecretVars({ user: "U", pass: "  ", API_KEY: "K" })).toEqual({
      USER: "U",
      API_KEY: "K",
    });
  });
});

describe("buildRunEnv injection", () => {
  const paths = projectPaths("/tmp/bt-test");
  const project: Project = { id: 1, name: "app", created_at: "" };

  function env(secret_vars: Record<string, string>): Environment {
    return { id: 1, project_id: 1, name: "stg", url: "https://stg.x", secret_vars, is_default: 1, created_at: "" };
  }

  it("injects each key as BULL_TERRA_<KEY> from process.env", () => {
    process.env.APP_USER = "qa-bot";
    process.env.APP_KEY = "secret-key";
    const out = buildRunEnv(paths, project, env({ USER: "APP_USER", API_KEY: "APP_KEY" }));
    expect(out.BULL_TERRA_USER).toBe("qa-bot");
    expect(out.BULL_TERRA_API_KEY).toBe("secret-key");
    delete process.env.APP_USER;
    delete process.env.APP_KEY;
  });

  it("skips keys whose .env var is unset", () => {
    const out = buildRunEnv(paths, project, env({ MISSING: "NOT_SET_ANYWHERE" }));
    expect(out.BULL_TERRA_MISSING).toBeUndefined();
  });
});

describe("legacy user_var/pass_var migration", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-mig-"));
    dbPath = join(dir, "data.db");
    // Materialize a pre-secret_vars database by hand.
    const old = new Database(dbPath);
    old.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE environments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        user_var TEXT,
        pass_var TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, name)
      );
    `);
    old.prepare(`INSERT INTO projects (id, name) VALUES (1, 'app')`).run();
    old.prepare(
      `INSERT INTO environments (project_id, name, url, user_var, pass_var, is_default) VALUES (?,?,?,?,?,?)`,
    ).run(1, "stg", "https://stg.x", "APP_USER", "APP_PASS", 1);
    old.prepare(
      `INSERT INTO environments (project_id, name, url, user_var, pass_var, is_default) VALUES (?,?,?,?,?,?)`,
    ).run(1, "public", "https://pub.x", null, null, 0);
    old.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("backfills secret_vars from the old columns and drops them", () => {
    const db = new Db(dbPath);
    const stg = db.getEnvironment(1, "stg");
    const pub = db.getEnvironment(1, "public");
    expect(stg?.secret_vars).toEqual({ USER: "APP_USER", PASS: "APP_PASS" });
    expect(pub?.secret_vars).toEqual({}); // both nulls -> empty map

    const cols = new Set(
      (db as unknown as { sqlite: Database.Database }).sqlite
        .prepare(`PRAGMA table_info(environments)`)
        .all()
        .map((col) => (col as { name: string }).name),
    );
    expect(cols.has("user_var")).toBe(false);
    expect(cols.has("pass_var")).toBe(false);
    expect(cols.has("secret_vars")).toBe(true);
    db.close();
  });

  it("is idempotent across reopens", () => {
    new Db(dbPath).close();
    const db = new Db(dbPath);
    expect(db.getEnvironment(1, "stg")?.secret_vars).toEqual({ USER: "APP_USER", PASS: "APP_PASS" });
    db.close();
  });
});

describe("feature-scoped recordings", () => {
  it("allows each feature to own a base recording", () => {
    const db = new Db(":memory:");
    const projectId = db.createProject("app").id;
    const checkout = db.upsertFeature(projectId, "checkout", "sheet-a");
    const login = db.upsertFeature(projectId, "login", "sheet-b");

    db.addFeatureRecording(projectId, checkout.id, "base", "/tmp/checkout/base.ts");
    db.addFeatureRecording(projectId, login.id, "base", "/tmp/login/base.ts");

    expect(db.getRecording(projectId, checkout.id, "base")?.path).toBe("/tmp/checkout/base.ts");
    expect(db.getRecording(projectId, login.id, "base")?.path).toBe("/tmp/login/base.ts");
    db.close();
  });

  it("keeps legacy project recordings unassigned during migration", () => {
    const dir = mkdtempSync(join(tmpdir(), "bt-rec-mig-"));
    const dbPath = join(dir, "data.db");
    const old = new Database(dbPath);
    old.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, name)
      );
    `);
    old.prepare(`INSERT INTO projects (id, name) VALUES (1, 'app')`).run();
    old.prepare(`INSERT INTO recordings (project_id, name, path) VALUES (?,?,?)`).run(
      1,
      "base",
      "/tmp/shared/base.ts",
    );
    old.close();

    const db = new Db(dbPath);
    const [recording] = db.listRecordings(1);
    expect(recording.feature_id).toBeNull();
    expect(recording.path).toBe("/tmp/shared/base.ts");
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
