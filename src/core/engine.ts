import type { Db } from "./db.js";
import { evaluateGate } from "./gate.js";
import { envAuthStatePath, type ProjectPaths } from "./paths.js";
import { runSpecs } from "./runner.js";
import type {
  Environment,
  GateVerdict,
  Project,
  ParsedTestResult,
  Run,
  RunEvent,
  RunStatus,
} from "./types.js";

export interface ExecuteOptions {
  db: Db;
  project: Project;
  env: Environment;
  paths: ProjectPaths;
  specsDir: string;
  features?: string[];
  onEvent?: (e: RunEvent) => void;
  signal?: AbortSignal;
}

export interface ExecuteResult {
  run: Run;
  results: ParsedTestResult[];
  verdict: GateVerdict;
}

/**
 * Resolve the env vars injected into the Playwright process for a target env:
 * the base URL, the storage-state path, and the login credentials looked up
 * from the .env vars this env *names* (user_var / pass_var) — secrets never
 * live in the DB, only the variable names do.
 */
export function buildRunEnv(
  paths: ProjectPaths,
  project: Project,
  env: Environment,
): Record<string, string> {
  const out: Record<string, string> = {
    BASE_URL: env.url,
    BULL_TERRA_ENV: env.name,
    BULL_TERRA_STORAGE_STATE: envAuthStatePath(paths, project.name, env.name),
  };
  const user = env.user_var ? process.env[env.user_var] : undefined;
  const pass = env.pass_var ? process.env[env.pass_var] : undefined;
  if (user) out.BULL_TERRA_USER = user;
  if (pass) out.BULL_TERRA_PASS = pass;
  return out;
}

/**
 * One full run lifecycle against a single environment: create the run row,
 * stream live events, persist results, evaluate the per-env regression gate,
 * promote baselines, finish the run. Shared by the CLI gate and the dashboard.
 */
export async function executeRun(opts: ExecuteOptions): Promise<ExecuteResult> {
  const { db, project, env, paths, specsDir, features, onEvent, signal } = opts;
  const featureLabel = features && features.length === 1 ? features[0] : null;
  const run = db.startRun(project.id, env.id, featureLabel);
  onEvent?.({ type: "run-start", runId: run.id, feature: featureLabel, env: env.name });

  const outcome = await runSpecs({
    projectRoot: paths.root,
    specsDir,
    features,
    signal,
    extraEnv: buildRunEnv(paths, project, env),
    onEvent: (e) => onEvent?.(e),
  });

  for (const r of outcome.results) db.recordResult(run.id, r);

  // Evaluate the gate BEFORE promoting baselines so a regression is detected
  // against the prior baseline, then promote freshly-passing tests.
  const verdict = evaluateGate(db, project.id, env.id, outcome.results, { updateBaselines: true });

  let status: RunStatus;
  if (outcome.aborted) status = "stopped";
  else if (outcome.results.length === 0 && outcome.exitCode !== 0) status = "error";
  else if (verdict.regressions.length > 0 || verdict.newFailures.length > 0) status = "failed";
  else status = "passed";

  db.finishRun(run.id, status);
  onEvent?.({ type: "run-end", runId: run.id, verdict, status });

  return { run: db.getRun(run.id)!, results: outcome.results, verdict };
}
