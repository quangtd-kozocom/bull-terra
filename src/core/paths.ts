import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * bull-terra runtime state lives in one user-level home so the dashboard and
 * CLI always see the same DB, recordings, generated specs, and run artifacts,
 * regardless of which directory launched the command.
 */
export function bullTerraHome(): string {
  const override = process.env.BULL_TERRA_HOME?.trim();
  return resolve(override || join(homedir(), ".bull-terra"));
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

export function projectPaths(root: string = bullTerraHome()): ProjectPaths {
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

/**
 * recordings/<project>/.auth/<env>.json — the logged-in storageState for one
 * target. Lives with the project's other assets; the dot-dir keeps it apart
 * from feature recording folders (same convention as .history / .runs).
 */
export function envAuthStatePath(
  paths: ProjectPaths,
  projectName: string,
  envName: string,
): string {
  return join(projectRecordingsDir(paths, projectName), ".auth", `${safePathSegment(envName)}.json`);
}

/** Pre-restructure location (auth/<project>-<env>.json), kept only for migration. */
export function legacyEnvAuthStatePath(
  paths: ProjectPaths,
  projectName: string,
  envName: string,
): string {
  return join(paths.authDir, `${safePathSegment(projectName)}-${safePathSegment(envName)}.json`);
}

/** recordings/<project>/.runs/run-<id>/ — Playwright artifacts (videos, traces) for one run. */
export function runArtifactsDir(paths: ProjectPaths, projectName: string, runId: number): string {
  return join(projectRecordingsDir(paths, projectName), ".runs", `run-${runId}`);
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
