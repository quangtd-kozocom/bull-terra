import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * bull-terra runs against the *installed project* — the cwd where a developer
 * invokes `bull-terra`. All state (db, recordings, generated specs, traces)
 * lives under that project root, never inside the npm package.
 *
 * The project root is the nearest ancestor of cwd that contains a marker
 * (`data.db`, `playwright.config.ts`, or `package.json`); falls back to cwd.
 */
export function findProjectRoot(start: string = process.cwd()): string {
  const markers = ["data.db", "playwright.config.ts", "package.json"];
  let dir = resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (markers.some((m) => existsSync(join(dir, m)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export interface ProjectPaths {
  root: string;
  dbPath: string;
  recordingsDir: string;
  specsDir: string;
  tracesDir: string;
  /** Directory holding per-(project,env) storage-state files. */
  authDir: string;
  envPath: string;
  envExamplePath: string;
  playwrightConfig: string;
}

export function projectPaths(root: string = findProjectRoot()): ProjectPaths {
  return {
    root,
    dbPath: join(root, "data.db"),
    recordingsDir: join(root, "recordings"),
    specsDir: join(root, "tests", "gen"),
    tracesDir: join(root, "test-results"),
    authDir: join(root, "auth"),
    envPath: join(root, ".env"),
    envExamplePath: join(root, ".env.example"),
    playwrightConfig: join(root, "playwright.config.ts"),
  };
}

/** auth/<project>-<env>.json — the logged-in storageState for one target. */
export function envAuthStatePath(
  paths: ProjectPaths,
  projectName: string,
  envName: string,
): string {
  return join(paths.authDir, `${safePathSegment(projectName)}-${safePathSegment(envName)}.json`);
}

/** recordings/<project>/ */
export function projectRecordingsDir(paths: ProjectPaths, projectName: string): string {
  return join(paths.recordingsDir, safePathSegment(projectName));
}

/** recordings/<project>/<feature>/ */
export function featureRecordingsDir(
  paths: ProjectPaths,
  projectName: string,
  featureName: string,
): string {
  return join(projectRecordingsDir(paths, projectName), safePathSegment(featureName));
}

/** recordings/<project>/<feature>/<recording>.ts */
export function featureRecordingPath(
  paths: ProjectPaths,
  projectName: string,
  featureName: string,
  recordingName: string,
): string {
  return join(featureRecordingsDir(paths, projectName, featureName), `${safePathSegment(recordingName)}.ts`);
}

/** tests/gen/<project>/ */
export function projectSpecsDir(paths: ProjectPaths, projectName: string): string {
  return join(paths.specsDir, projectName);
}

export function safePathSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}
