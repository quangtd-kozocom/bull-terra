import { existsSync, statSync } from "node:fs";
import { relative } from "node:path";
import type { Db } from "../core/db.js";
import { discoverTests } from "../core/discover.js";
import { isFlaky } from "../core/gate.js";
import { envAuthStatePath, projectSpecsDir, type ProjectPaths } from "../core/paths.js";
import type {
  Environment,
  Feature,
  Project,
  Recording,
  RunSummary,
  TestHistoryEntry,
} from "../core/types.js";

export interface TestView {
  testId: string;
  tcId: string | null;
  title: string;
  /** Latest observed status for the active env, or "never-run". */
  status: string;
  baseline: string | null;
  error: string | null;
  tracePath: string | null;
  durationMs: number | null;
  /** Recent outcomes on the active env, newest first (sparkline data). */
  history: TestHistoryEntry[];
  /** True when the gate's flaky heuristic would quarantine this test's failures. */
  flaky: boolean;
}

export interface FeatureView {
  feature: string;
  specRelPath: string;
  /** Registered sheet id for this feature (1:1 sheet = feature), if any. */
  sheetId: string | null;
  startPath: string;
  requiresAuth: boolean;
  /** True when a feature row exists in the DB (vs only discovered on disk). */
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

/** Latest-result tally for one env, computed on the same basis as project totals. */
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
  /** This env's own test outcomes — lets the UI compare any env to the active one. */
  health: EnvHealth;
}

export interface ProjectView {
  id: number;
  name: string;
  created_at: string;
  environments: EnvironmentView[];
  /** The env this view's statuses/baselines are computed for. */
  activeEnv: string | null;
  features: FeatureView[];
  recordings: RecordingView[];
  recentRuns: RunSummary[];
  totals: { tests: number; passed: number; failed: number; never: number };
}

function envView(
  paths: ProjectPaths,
  project: Project,
  e: Environment,
  health: EnvHealth,
): EnvironmentView {
  const authPath = envAuthStatePath(paths, project.name, e.name);
  const authStateExists = existsSync(authPath);
  return {
    id: e.id,
    name: e.name,
    url: e.url,
    secretVars: e.secret_vars,
    isDefault: e.is_default === 1,
    authStatePath: relative(paths.root, authPath).split("\\").join("/"),
    authStateExists,
    authStateUpdatedAt: authStateExists ? statSync(authPath).mtime.toISOString() : null,
    health,
  };
}

/**
 * Tally one env's latest-per-test outcomes against the project's discovered
 * tests — the same basis as the active-env gauges, so an env's numbers mean the
 * same thing wherever they appear. A regression is a test green in the baseline
 * but now failing on this env.
 */
function envHealth(
  db: Db,
  projectId: number,
  envId: number,
  discovered: { testId: string }[],
): EnvHealth {
  const latest = db.latestResultsByTest(projectId, envId);
  const baselines = new Map(
    db.listBaselines(projectId, envId).map((b) => [b.test_id, b.last_known_status]),
  );
  let passed = 0;
  let failed = 0;
  let never = 0;
  let regressions = 0;
  for (const t of discovered) {
    const status = latest.get(t.testId)?.status ?? "never-run";
    if (status === "passed") passed++;
    else if (status === "never-run") never++;
    else {
      failed++;
      if (baselines.get(t.testId) === "passed" && (status === "failed" || status === "timedOut")) {
        regressions++;
      }
    }
  }
  return {
    passed,
    failed,
    never,
    total: discovered.length,
    regressions,
    lastRunAt: db.listRuns(projectId, envId, 1)[0]?.started_at ?? null,
  };
}

function recordingView(recording: Recording, featureName: string | null): RecordingView {
  return {
    id: recording.id,
    name: recording.name,
    path: recording.path,
    feature: featureName,
    isPrimary: recording.name === "base",
    created_at: recording.created_at,
  };
}

/**
 * Assemble the full dashboard view for a project against ONE environment:
 * convention-discovered tests joined with that env's latest result + baseline,
 * plus the project's registered environments and features. No sheet/MCP call.
 */
export function buildProjectView(
  db: Db,
  paths: ProjectPaths,
  project: Project,
  envName?: string,
): ProjectView {
  const environments = db.listEnvironments(project.id);
  const activeEnv =
    (envName ? environments.find((e) => e.name === envName) : undefined) ??
    db.getDefaultEnvironment(project.id);

  const specsDir = projectSpecsDir(paths, project.name);
  const discovered = discoverTests(specsDir);
  const latest = activeEnv ? db.latestResultsByTest(project.id, activeEnv.id) : new Map();
  const histories = activeEnv
    ? db.historiesByTest(project.id, activeEnv.id)
    : new Map<string, TestHistoryEntry[]>();
  const baselines = new Map(
    activeEnv ? db.listBaselines(project.id, activeEnv.id).map((b) => [b.test_id, b.last_known_status]) : [],
  );
  const featureRows = new Map<string, Feature>(db.listFeatures(project.id).map((f) => [f.name, f]));
  const featureNamesById = new Map([...featureRows.values()].map((f) => [f.id, f.name]));
  const allRecordings = db
    .listRecordings(project.id)
    .map((r) => recordingView(r, r.feature_id == null ? null : featureNamesById.get(r.feature_id) ?? null));
  const recordingsByFeature = new Map<string, RecordingView[]>();
  for (const recording of allRecordings) {
    if (!recording.feature) continue;
    const current = recordingsByFeature.get(recording.feature) ?? [];
    current.push(recording);
    recordingsByFeature.set(recording.feature, current);
  }

  const byFeature = new Map<string, FeatureView>();
  const totals = { tests: 0, passed: 0, failed: 0, never: 0 };

  for (const t of discovered) {
    const result = latest.get(t.testId);
    const status = result?.status ?? "never-run";
    const history = histories.get(t.testId) ?? [];
    const view: TestView = {
      testId: t.testId,
      tcId: t.tcId,
      title: t.title,
      status,
      baseline: baselines.get(t.testId) ?? null,
      error: result?.error ?? null,
      tracePath: result?.trace_path ?? null,
      durationMs: result?.duration_ms ?? null,
      history,
      // Mirror the gate's quarantine condition so "flaky" here means "won't trip the gate".
      flaky: history.length >= 4 && isFlaky(history.map((h) => h.status)),
    };
    let fv = byFeature.get(t.feature);
    if (!fv) {
      const row = featureRows.get(t.feature);
      fv = {
        feature: t.feature,
        specRelPath: t.specRelPath,
        sheetId: row?.sheet_id ?? null,
        startPath: row?.start_path ?? "/",
        requiresAuth: row?.requires_auth === 1,
        registered: !!row,
        tests: [],
        counts: {},
        recordings: recordingsByFeature.get(t.feature) ?? [],
        hasBaseRecording: (recordingsByFeature.get(t.feature) ?? []).some((r) => r.name === "base"),
      };
      byFeature.set(t.feature, fv);
    }
    fv.tests.push(view);
    fv.counts[status] = (fv.counts[status] ?? 0) + 1;
    totals.tests++;
    if (status === "passed") totals.passed++;
    else if (status === "never-run") totals.never++;
    else totals.failed++;
  }

  // Surface registered features that have no generated specs on disk yet.
  for (const f of featureRows.values()) {
    if (byFeature.has(f.name)) continue;
    byFeature.set(f.name, {
      feature: f.name,
      specRelPath: `${project.name}/${f.name}.spec.ts`,
      sheetId: f.sheet_id,
      startPath: f.start_path,
      requiresAuth: f.requires_auth === 1,
      registered: true,
      tests: [],
      counts: {},
      recordings: recordingsByFeature.get(f.name) ?? [],
      hasBaseRecording: (recordingsByFeature.get(f.name) ?? []).some((r) => r.name === "base"),
    });
  }

  return {
    id: project.id,
    name: project.name,
    created_at: project.created_at,
    environments: environments.map((env) =>
      envView(paths, project, env, envHealth(db, project.id, env.id, discovered)),
    ),
    activeEnv: activeEnv?.name ?? null,
    features: [...byFeature.values()].sort((a, b) => a.feature.localeCompare(b.feature)),
    recordings: allRecordings,
    recentRuns: activeEnv ? db.listRunSummaries(project.id, activeEnv.id, 10) : [],
    totals,
  };
}
