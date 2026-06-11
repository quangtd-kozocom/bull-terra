// Mirrors the server's view + event shapes (src/server/views.ts, src/core/types.ts).

export interface TestView {
  testId: string;
  tcId: string | null;
  title: string;
  status: string;
  baseline: string | null;
  error: string | null;
  tracePath: string | null;
  durationMs: number | null;
}

export interface FeatureView {
  feature: string;
  specRelPath: string;
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
  recentRuns: { id: number; feature: string | null; env: number; status: string; started_at: string }[];
  totals: { tests: number; passed: number; failed: number; never: number };
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
