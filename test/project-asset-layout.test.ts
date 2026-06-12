import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { featureInspect } from "../src/cli/commands/feature.js";
import { migrateAuthStateFiles } from "../src/core/auth.js";
import { Db } from "../src/core/db.js";
import {
  envAuthStatePath,
  featureRecordingPath,
  legacyEnvAuthStatePath,
  projectPaths,
  runArtifactsDir,
  type ProjectPaths,
} from "../src/core/paths.js";

describe("per-project asset layout", () => {
  let dir: string;
  let paths: ProjectPaths;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-layout-"));
    paths = projectPaths(dir);
    db = new Db(":memory:");
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("defaults runtime state to BULL_TERRA_HOME when set", () => {
    const prev = process.env.BULL_TERRA_HOME;
    process.env.BULL_TERRA_HOME = dir;
    try {
      expect(projectPaths().dbPath).toBe(join(dir, "data.db"));
      expect(projectPaths().recordingsDir).toBe(join(dir, "recordings"));
      expect(projectPaths().specsDir).toBe(join(dir, "tests", "gen"));
    } finally {
      if (prev === undefined) delete process.env.BULL_TERRA_HOME;
      else process.env.BULL_TERRA_HOME = prev;
    }
  });

  it("places auth state and run artifacts under recordings/<project>/", () => {
    expect(envAuthStatePath(paths, "app", "stg")).toBe(
      join(dir, "recordings", "app", ".auth", "stg.json"),
    );
    expect(runArtifactsDir(paths, "app", 7)).toBe(
      join(dir, "recordings", "app", ".runs", "run-7"),
    );
  });

  it("sanitizes project and env names in paths", () => {
    expect(envAuthStatePath(paths, "my app", "stg/eu")).toBe(
      join(dir, "recordings", "my_app", ".auth", "stg_eu.json"),
    );
  });

  describe("migrateAuthStateFiles", () => {
    it("moves legacy auth/<project>-<env>.json into the new layout", () => {
      const projectId = db.createProject("app").id;
      db.upsertEnvironment(projectId, "stg", "https://stg.x");
      const legacy = legacyEnvAuthStatePath(paths, "app", "stg");
      mkdirSync(dirname(legacy), { recursive: true });
      writeFileSync(legacy, `{"cookies":[]}`);

      migrateAuthStateFiles(db, paths);

      expect(existsSync(legacy)).toBe(false);
      expect(readFileSync(envAuthStatePath(paths, "app", "stg"), "utf8")).toBe(`{"cookies":[]}`);
    });

    it("never overwrites an already-captured new-layout state", () => {
      const projectId = db.createProject("app").id;
      db.upsertEnvironment(projectId, "stg", "https://stg.x");
      const legacy = legacyEnvAuthStatePath(paths, "app", "stg");
      const current = envAuthStatePath(paths, "app", "stg");
      mkdirSync(dirname(legacy), { recursive: true });
      writeFileSync(legacy, "old");
      mkdirSync(dirname(current), { recursive: true });
      writeFileSync(current, "new");

      migrateAuthStateFiles(db, paths);

      expect(readFileSync(current, "utf8")).toBe("new");
      expect(existsSync(legacy)).toBe(true); // left in place, not destroyed
    });

    it("rewrites legacy auth paths baked into recordings and specs", () => {
      const projectId = db.createProject("app").id;
      db.upsertEnvironment(projectId, "stg", "https://stg.x");
      const legacyAbs = legacyEnvAuthStatePath(paths, "app", "stg");
      const currentAbs = envAuthStatePath(paths, "app", "stg");

      const recording = join(dir, "recordings", "app", "checkout", "base.ts");
      mkdirSync(dirname(recording), { recursive: true });
      writeFileSync(recording, `test.use({\n  storageState: '${legacyAbs}'\n});\n`);
      const spec = join(dir, "tests", "gen", "app", "checkout.spec.ts");
      mkdirSync(dirname(spec), { recursive: true });
      writeFileSync(spec, `test.use({ storageState: "auth/app-stg.json" });\n`);

      migrateAuthStateFiles(db, paths);

      expect(readFileSync(recording, "utf8")).toContain(`storageState: '${currentAbs}'`);
      expect(readFileSync(spec, "utf8")).toContain(`storageState: "${currentAbs}"`);
      // Idempotent: a second pass leaves the files untouched.
      const before = readFileSync(recording, "utf8");
      migrateAuthStateFiles(db, paths);
      expect(readFileSync(recording, "utf8")).toBe(before);
    });

    it("is a no-op when there is nothing to migrate", () => {
      const projectId = db.createProject("app").id;
      db.upsertEnvironment(projectId, "stg", "https://stg.x");
      expect(() => migrateAuthStateFiles(db, paths)).not.toThrow();
      expect(existsSync(envAuthStatePath(paths, "app", "stg"))).toBe(false);
    });
  });
});

describe("feature inspect CLI payload", () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-inspect-"));
    prevHome = process.env.BULL_TERRA_HOME;
    process.env.BULL_TERRA_HOME = dir;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.BULL_TERRA_HOME;
    else process.env.BULL_TERRA_HOME = prevHome;
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("prints feature, env, recording, and state paths as JSON", () => {
    const paths = projectPaths();
    const db = new Db(paths.dbPath);
    try {
      const project = db.createProject("app");
      db.upsertEnvironment(project.id, "stg", "https://stg.example", { isDefault: true });
      const feature = db.upsertFeature(project.id, "checkout", "sheet-123", {
        startPath: "/cart",
        requiresAuth: true,
      });
      const basePath = featureRecordingPath(paths, project.name, feature.name, "base");
      db.addFeatureRecording(project.id, feature.id, "base", basePath);
    } finally {
      db.close();
    }

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => logs.push(String(value)));

    featureInspect("app", "checkout", { json: true });

    const payload = JSON.parse(logs[0]) as {
      stateRoot: string;
      dbPath: string;
      feature: { sheetId: string; startPath: string; requiresAuth: boolean };
      environments: Array<{ name: string; isDefault: boolean }>;
      recordings: Array<{ name: string; path: string }>;
      hasBaseRecording: boolean;
    };
    expect(payload.stateRoot).toBe(dir);
    expect(payload.dbPath).toBe(join(dir, "data.db"));
    expect(payload.feature).toMatchObject({ sheetId: "sheet-123", startPath: "/cart", requiresAuth: true });
    expect(payload.environments).toEqual([expect.objectContaining({ name: "stg", isDefault: true })]);
    expect(payload.recordings).toEqual([expect.objectContaining({ name: "base" })]);
    expect(payload.hasBaseRecording).toBe(true);
  });
});
