import type { Db } from "./db.js";
import { evaluateGate } from "./gate.js";
import { runSpecs } from "./runner.js";
import type { GateVerdict, Project, ParsedTestResult, Run, RunEvent, RunStatus } from "./types.js";

export interface ExecuteOptions {
  db: Db;
  project: Project;
  projectRoot: string;
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
 * One full run lifecycle: create the run row, stream live events, persist
 * results, evaluate the regression gate, promote baselines, finish the run.
 * Shared verbatim by the CLI gate and the web dashboard.
 */
export async function executeRun(opts: ExecuteOptions): Promise<ExecuteResult> {
  const { db, project, projectRoot, specsDir, features, onEvent, signal } = opts;
  const featureLabel = features && features.length === 1 ? features[0] : null;
  const run = db.startRun(project.id, featureLabel);
  onEvent?.({ type: "run-start", runId: run.id, feature: featureLabel });

  const outcome = await runSpecs({
    projectRoot,
    specsDir,
    features,
    signal,
    onEvent: (e) => onEvent?.(e),
  });

  for (const r of outcome.results) db.recordResult(run.id, r);

  // Evaluate the gate BEFORE promoting baselines so a regression is detected
  // against the prior baseline, then promote freshly-passing tests.
  const verdict = evaluateGate(db, project.id, outcome.results, { updateBaselines: true });

  let status: RunStatus;
  if (outcome.aborted) status = "stopped";
  else if (outcome.results.length === 0 && outcome.exitCode !== 0) status = "error";
  else if (verdict.regressions.length > 0 || verdict.newFailures.length > 0) status = "failed";
  else status = "passed";

  db.finishRun(run.id, status);
  onEvent?.({ type: "run-end", runId: run.id, verdict, status });

  return { run: db.getRun(run.id)!, results: outcome.results, verdict };
}
