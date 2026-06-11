import { existsSync, statSync } from "node:fs";
import { relative } from "node:path";
import { envAuthStatePath, type ProjectPaths } from "./paths.js";
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
