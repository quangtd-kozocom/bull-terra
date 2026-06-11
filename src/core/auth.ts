import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Db } from "./db.js";
import {
  envAuthStatePath,
  legacyEnvAuthStatePath,
  projectRecordingsDir,
  projectSpecsDir,
  type ProjectPaths,
} from "./paths.js";
import type { Environment, Feature, Project } from "./types.js";

const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function normalizeStartPath(value: string | null | undefined): string {
  const path = value?.trim() || "/";
  if (URL_SCHEME_RE.test(path)) throw new Error("start path must be relative, not a full URL");
  return path;
}

export function featureStartUrl(env: Environment, feature: Feature): string {
  return new URL(normalizeStartPath(feature.start_path), env.url).toString();
}

/** Recursively collect .ts files (recordings, specs) under a directory. */
function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * `playwright codegen --load-storage` bakes the storage-state path into the
 * recording (`test.use({ storageState: '…' })`), so moving the auth file would
 * silently break those files: Playwright can't load the session and the test
 * "does nothing". Rewrite legacy references (absolute and root-relative) in
 * the project's recordings and specs to the new location.
 */
function rewriteLegacyAuthReferences(paths: ProjectPaths, projectName: string, envName: string): void {
  const legacyAbs = legacyEnvAuthStatePath(paths, projectName, envName);
  const currentAbs = envAuthStatePath(paths, projectName, envName);
  const legacyRel = relative(paths.root, legacyAbs).split("\\").join("/");
  const files = [
    ...walkTsFiles(projectRecordingsDir(paths, projectName)),
    ...walkTsFiles(projectSpecsDir(paths, projectName)),
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes(legacyAbs) && !src.includes(legacyRel)) continue;
    // Absolute first — the absolute form contains the relative form as a substring.
    writeFileSync(file, src.split(legacyAbs).join(currentAbs).split(legacyRel).join(currentAbs));
  }
}

/**
 * One-shot move of legacy auth/<project>-<env>.json files into the per-project
 * recordings/<project>/.auth/ layout, plus a rewrite of any recordings/specs
 * that referenced the old path. Idempotent; run at every CLI/server startup so
 * existing installs migrate with zero user action.
 */
export function migrateAuthStateFiles(db: Db, paths: ProjectPaths): void {
  for (const project of db.listProjects()) {
    for (const env of db.listEnvironments(project.id)) {
      const legacy = legacyEnvAuthStatePath(paths, project.name, env.name);
      const current = envAuthStatePath(paths, project.name, env.name);
      if (existsSync(legacy) && !existsSync(current)) {
        mkdirSync(dirname(current), { recursive: true });
        renameSync(legacy, current);
      }
      // Run even when the file moved on an earlier startup — a recording may
      // still carry the old path.
      rewriteLegacyAuthReferences(paths, project.name, env.name);
    }
  }
}

export function authStateInfo(paths: ProjectPaths, project: Project, env: Environment) {
  const path = envAuthStatePath(paths, project.name, env.name);
  const exists = existsSync(path);
  return {
    path,
    relPath: relative(paths.root, path).split("\\").join("/"),
    exists,
    updatedAt: exists ? statSync(path).mtime.toISOString() : null,
  };
}

export function hasAuthSecretVars(env: Environment): boolean {
  return Boolean(env.secret_vars.USER && env.secret_vars.PASS);
}

export function authRequirementError(
  paths: ProjectPaths,
  project: Project,
  env: Environment,
  feature: Feature,
): string | null {
  if (feature.requires_auth !== 1) return null;
  if (authStateInfo(paths, project, env).exists) return null;
  if (hasAuthSecretVars(env)) return null;
  return `Feature "${feature.name}" requires auth. Click "Login once" for "${env.name}" or configure USER/PASS secret vars first.`;
}
