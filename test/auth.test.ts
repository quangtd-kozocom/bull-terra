import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authRequirementError,
  featureStartUrl,
  normalizeStartPath,
} from "../src/core/auth.js";
import { envAuthStatePath, projectPaths, type ProjectPaths } from "../src/core/paths.js";
import type { Environment, Feature, Project } from "../src/core/types.js";

const project: Project = { id: 1, name: "app", created_at: "" };

function env(secret_vars: Record<string, string> = {}): Environment {
  return {
    id: 1,
    project_id: 1,
    name: "stg",
    url: "https://stg.example.com",
    secret_vars,
    is_default: 1,
    created_at: "",
  };
}

function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 1,
    project_id: 1,
    name: "checkout",
    sheet_id: null,
    start_path: "/",
    requires_auth: 0,
    created_at: "",
    ...overrides,
  };
}

describe("normalizeStartPath", () => {
  it("defaults blank input to /", () => {
    expect(normalizeStartPath(undefined)).toBe("/");
    expect(normalizeStartPath("")).toBe("/");
    expect(normalizeStartPath("  ")).toBe("/");
  });

  it("keeps a relative path", () => {
    expect(normalizeStartPath("/checkout?coupon=1")).toBe("/checkout?coupon=1");
    expect(normalizeStartPath("checkout")).toBe("checkout");
  });

  it("rejects a full URL", () => {
    expect(() => normalizeStartPath("https://other-site.com/checkout")).toThrow(/relative/);
  });
});

describe("featureStartUrl", () => {
  it("composes the env URL with the feature start path", () => {
    expect(featureStartUrl(env(), feature({ start_path: "/checkout" }))).toBe(
      "https://stg.example.com/checkout",
    );
  });

  it("resolves a bare relative segment against the env origin", () => {
    expect(featureStartUrl(env(), feature({ start_path: "checkout" }))).toBe(
      "https://stg.example.com/checkout",
    );
  });
});

describe("authRequirementError", () => {
  let dir: string;
  let paths: ProjectPaths;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-auth-"));
    paths = projectPaths(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns null for a public feature", () => {
    expect(authRequirementError(paths, project, env(), feature({ requires_auth: 0 }))).toBeNull();
  });

  it("blocks an auth-required feature with no auth state and no secret vars", () => {
    const err = authRequirementError(paths, project, env(), feature({ requires_auth: 1 }));
    expect(err).toMatch(/requires auth/);
  });

  it("allows when an auth state file exists", () => {
    const statePath = envAuthStatePath(paths, project.name, "stg");
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, "{}");
    expect(authRequirementError(paths, project, env(), feature({ requires_auth: 1 }))).toBeNull();
  });

  it("allows when USER/PASS secret vars are configured (CI/global-setup path)", () => {
    const e = env({ USER: "APP_USER", PASS: "APP_PASS" });
    expect(authRequirementError(paths, project, e, feature({ requires_auth: 1 }))).toBeNull();
  });
});
