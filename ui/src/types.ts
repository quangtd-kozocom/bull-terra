// Mirrors the server's view + event shapes (src/server/views.ts, src/core/types.ts).

/** One past outcome of a test on the active env (newest first in TestView.history). */
export interface TestHistoryEntry {
  runId: number;
  status: string;
  durationMs: number | null;
  at: string;
}

export interface TestView {
  testId: string;
  tcId: string | null;
  title: string;
  status: string;
  baseline: string | null;
  error: string | null;
  tracePath: string | null;
  /** Video of the latest run's steps, when "record video" was on. */
  videoPath: string | null;
  durationMs: number | null;
  history: TestHistoryEntry[];
  /** True when the gate's flaky heuristic quarantines this test's failures. */
  flaky: boolean;
}

export interface FeatureView {
  feature: string;
  sheetId: string | null;
  startPath: string;
  requiresAuth: boolean;
  registered: boolean;
  tests: TestView[];
  counts: Record<string, number>;
  recordings: RecordingView[];
  hasBaseRecording: boolean;
}

export interface RecordingView {
  id: number;
  name: string;
  path: string;
  feature: string | null;
  isPrimary: boolean;
  created_at: string;
}

export interface RecordingSourceView extends RecordingView {
  source: string;
}

export interface AuthStateView {
  env: string;
  path: string;
  updatedAt: string | null;
  source: string;
}

export interface EnvHealth {
  passed: number;
  failed: number;
  never: number;
  total: number;
  regressions: number;
  lastRunAt: string | null;
}

export interface EnvironmentView {
  id: number;
  name: string;
  url: string;
  /** KEY -> .env variable NAME. Names only; values stay in .env. */
  secretVars: Record<string, string>;
  isDefault: boolean;
  authStatePath: string;
  authStateExists: boolean;
  authStateUpdatedAt: string | null;
  /** This env's own test outcomes — for comparing any env to the active one. */
  health: EnvHealth;
}

export interface ProjectView {
  id: number;
  name: string;
  created_at: string;
  environments: EnvironmentView[];
  activeEnv: string | null;
  features: FeatureView[];
  recordings: RecordingView[];
  recentRuns: RunSummaryView[];
  totals: { tests: number; passed: number; failed: number; never: number };
}

/** A run plus its per-result tallies — one row of the history timeline. */
export interface RunSummaryView {
  id: number;
  feature: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  /** Gate classification counts; all 0 for runs older than verdict persistence. */
  regressions: number;
  newFailures: number;
  quarantined: number;
}

/** A recorded test video with its run context — one card on the screencasts tab. */
export interface ScreencastView {
  runId: number;
  feature: string | null;
  testId: string;
  title: string;
  status: string;
  videoPath: string;
  durationMs: number | null;
  /** started_at of the run that produced this video. */
  at: string;
}

/** Disk usage of run artifacts (videos/traces). */
export interface ArtifactStatsView {
  totalBytes: number;
  byRun: Record<number, number>;
}

/** Gate classification stored on a finished run (test ids per bucket). */
export interface RunVerdictView {
  regressions: string[];
  newFailures: string[];
  quarantined: string[];
}

export interface RunResultView {
  testId: string;
  title: string;
  status: string;
  error: string | null;
  tracePath: string | null;
  videoPath: string | null;
  durationMs: number | null;
}

export interface RunDetailView {
  run: {
    id: number;
    feature: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    verdict: RunVerdictView | null;
  };
  results: RunResultView[];
}

export interface GateVerdict {
  regressions: { title: string; error: string | null }[];
  newFailures: { title: string }[];
  quarantined: { title: string }[];
  passed: { title: string }[];
  exitCode: 0 | 1;
}

export type RunEvent =
  | { type: "run-start"; runId: number; feature: string | null; env: string }
  | { type: "test-begin"; title: string }
  | { type: "test-end"; title: string; status: string; durationMs: number }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "run-end"; runId: number; verdict: GateVerdict; status: string };

export interface NewEnvironment {
  name: string;
  url: string;
  /** KEY -> .env variable NAME. */
  secretVars: Record<string, string>;
  isDefault?: boolean;
}

export type EnvironmentInput = Omit<NewEnvironment, "isDefault">;

export interface FeatureInput {
  name: string;
  sheetId?: string;
  startPath: string;
  requiresAuth: boolean;
}
