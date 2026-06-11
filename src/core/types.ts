// Shared domain types for the bull-terra core engine.

export type TestStatus = "passed" | "failed" | "skipped" | "timedOut" | "interrupted";

export interface Project {
  id: number;
  name: string;
  url: string;
  sheet_id: string | null;
  created_at: string;
}

export interface Recording {
  id: number;
  project_id: number;
  name: string;
  path: string;
  created_at: string;
}

export type RunStatus = "running" | "passed" | "failed" | "error" | "stopped";

export interface Run {
  id: number;
  project_id: number;
  feature: string | null;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
}

export interface Result {
  id: number;
  run_id: number;
  test_id: string; // stable id: `${specRelPath}>${title}`
  title: string;
  status: TestStatus;
  error: string | null;
  trace_path: string | null;
  duration_ms: number | null;
}

export type BaselineStatus = "passed" | "failed";

export interface Baseline {
  project_id: number;
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
  | { type: "run-start"; runId: number; feature: string | null }
  | RunnerEvent
  | { type: "run-end"; runId: number; verdict: GateVerdict; status: RunStatus };
