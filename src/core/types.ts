// Shared domain types for the bull-terra core engine.

export type TestStatus = "passed" | "failed" | "skipped" | "timedOut" | "interrupted";

/** A project is just a named container; URLs live on environments, sheets on features. */
export interface Project {
  id: number;
  name: string;
  created_at: string;
}

/**
 * A target the same app is deployed to (local / dev / stg / prod). Holds the base
 * URL and a map of the *names* of the .env vars that supply this env's secrets, so
 * secrets never touch the DB. Exactly one env per project is the `is_default`.
 */
export interface Environment {
  id: number;
  project_id: number;
  name: string;
  url: string;
  /**
   * KEY -> .env variable NAME, e.g. { USER: "APP_A_STG_USER", API_KEY: "APP_A_STG_KEY" }.
   * Names only; values live in .env. Each is injected at run time as BULL_TERRA_<KEY>.
   */
  secret_vars: Record<string, string>;
  is_default: 0 | 1;
  created_at: string;
}

/** A unit of work backed by its own Google Sheet of test cases (1:1 sheet = feature). */
export interface Feature {
  id: number;
  project_id: number;
  name: string;
  sheet_id: string | null;
  start_path: string;
  requires_auth: 0 | 1;
  created_at: string;
}

export interface Recording {
  id: number;
  project_id: number;
  feature_id: number | null;
  name: string;
  path: string;
  created_at: string;
}

export type RunStatus = "running" | "passed" | "failed" | "error" | "stopped";

/**
 * The gate's classification of a finished run, persisted on the run row so
 * history can show WHY a run failed (regression vs new failure vs flaky).
 * Stores test ids; counts derive from lengths.
 */
export interface RunVerdict {
  regressions: string[];
  newFailures: string[];
  quarantined: string[];
}

export interface Run {
  id: number;
  project_id: number;
  env_id: number;
  feature: string | null;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  /** Null for runs recorded before verdict persistence existed. */
  verdict: RunVerdict | null;
}

export interface Result {
  id: number;
  run_id: number;
  test_id: string; // stable id: `${specRelPath}>${title}`
  title: string;
  status: TestStatus;
  error: string | null;
  trace_path: string | null;
  video_path: string | null;
  duration_ms: number | null;
}

/** One past outcome of a test on an env, used for history sparklines + flaky detection. */
export interface TestHistoryEntry {
  runId: number;
  status: TestStatus;
  durationMs: number | null;
  /** started_at of the run that produced this result. */
  at: string;
}

/** A run row enriched with its per-result tallies, for the dashboard history timeline. */
export interface RunSummary {
  id: number;
  feature: string | null;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  /** Gate classification counts; all 0 for pre-verdict runs (verdict was null). */
  regressions: number;
  newFailures: number;
  quarantined: number;
}

/** One recorded test video (screencast) with its run context, for the screencasts tab. */
export interface Screencast {
  runId: number;
  feature: string | null;
  testId: string;
  title: string;
  status: TestStatus;
  videoPath: string;
  durationMs: number | null;
  /** started_at of the run that produced this video. */
  at: string;
}

export type BaselineStatus = "passed" | "failed";

/** Baselines are keyed per environment so "green on stg" and "green on local" are tracked apart. */
export interface Baseline {
  project_id: number;
  env_id: number;
  test_id: string;
  last_known_status: BaselineStatus;
  updated_at: string;
}

/** A test case discovered by convention (folder = feature, `TC-xx:` title = sheet row). */
export interface DiscoveredTest {
  testId: string; // `${specRelPath}>${title}`
  specPath: string; // absolute
  specRelPath: string;
  feature: string; // folder under tests/gen/<project>/
  tcId: string | null; // e.g. "TC-01" parsed from the title, or null
  title: string;
}

/** Outcome of a single test parsed from Playwright's JSON reporter. */
export interface ParsedTestResult {
  testId: string;
  title: string;
  feature: string;
  status: TestStatus;
  error: string | null;
  tracePath: string | null;
  /** Recorded video of the test steps, when video was enabled for the run. */
  videoPath: string | null;
  durationMs: number;
}

/** The regression-aware verdict for a finished run. */
export interface GateVerdict {
  /** Tests that were PASS in the baseline and are now FAIL — the only thing that fails the gate. */
  regressions: ParsedTestResult[];
  /** Tests failing that never passed before (work-in-progress). Reported, not gating. */
  newFailures: ParsedTestResult[];
  /** Tests flagged flaky (status flips without code change) — excluded from the gate. */
  quarantined: ParsedTestResult[];
  passed: ParsedTestResult[];
  /** Process exit code: 1 iff there are real regressions. */
  exitCode: 0 | 1;
}

/** Events the runner emits per test / per output line (no run id — the engine owns runs). */
export type RunnerEvent =
  | { type: "test-begin"; title: string }
  | { type: "test-end"; title: string; status: TestStatus; durationMs: number }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string };

/** Everything streamed over SSE while a run is in flight. */
export type RunEvent =
  | { type: "run-start"; runId: number; feature: string | null; env: string }
  | RunnerEvent
  | { type: "run-end"; runId: number; verdict: GateVerdict; status: RunStatus };
