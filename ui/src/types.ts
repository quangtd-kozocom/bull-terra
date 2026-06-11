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
  registered: boolean;
  tests: TestView[];
  counts: Record<string, number>;
}

export interface EnvironmentView {
  id: number;
  name: string;
  url: string;
  userVar: string | null;
  passVar: string | null;
  isDefault: boolean;
}

export interface ProjectView {
  id: number;
  name: string;
  created_at: string;
  environments: EnvironmentView[];
  activeEnv: string | null;
  features: FeatureView[];
  recordings: { id: number; name: string; path: string }[];
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
  userVar?: string;
  passVar?: string;
  isDefault?: boolean;
}
