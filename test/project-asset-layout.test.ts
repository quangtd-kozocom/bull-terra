import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateAuthStateFiles } from "../src/core/auth.js";
import { Db } from "../src/core/db.js";
import {
  envAuthStatePath,
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
