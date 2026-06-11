import type { Db } from "../core/db.js";
import { discoverTests } from "../core/discover.js";
import { projectSpecsDir, type ProjectPaths } from "../core/paths.js";
import type { Environment, Feature, Project } from "../core/types.js";

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
}

export interface FeatureView {
  feature: string;
  specRelPath: string;
  /** Registered sheet id for this feature (1:1 sheet = feature), if any. */
  sheetId: string | null;
  /** True when a feature row exists in the DB (vs only discovered on disk). */
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
  /** The env this view's statuses/baselines are computed for. */
  activeEnv: string | null;
  features: FeatureView[];
  recordings: { id: number; name: string; path: string }[];
  recentRuns: { id: number; feature: string | null; env: number; status: string; started_at: string }[];
  totals: { tests: number; passed: number; failed: number; never: number };
}

function envView(e: Environment): EnvironmentView {
  return {
    id: e.id,
    name: e.name,
    url: e.url,
    userVar: e.user_var,
    passVar: e.pass_var,
    isDefault: e.is_default === 1,
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
  const baselines = new Map(
    activeEnv ? db.listBaselines(project.id, activeEnv.id).map((b) => [b.test_id, b.last_known_status]) : [],
  );
  const featureRows = new Map<string, Feature>(db.listFeatures(project.id).map((f) => [f.name, f]));

  const byFeature = new Map<string, FeatureView>();
  const totals = { tests: 0, passed: 0, failed: 0, never: 0 };

  for (const t of discovered) {
    const result = latest.get(t.testId);
    const status = result?.status ?? "never-run";
    const view: TestView = {
      testId: t.testId,
      tcId: t.tcId,
      title: t.title,
      status,
      baseline: baselines.get(t.testId) ?? null,
      error: result?.error ?? null,
      tracePath: result?.trace_path ?? null,
      durationMs: result?.duration_ms ?? null,
    };
    let fv = byFeature.get(t.feature);
    if (!fv) {
      const row = featureRows.get(t.feature);
      fv = {
        feature: t.feature,
        specRelPath: t.specRelPath,
        sheetId: row?.sheet_id ?? null,
        registered: !!row,
        tests: [],
        counts: {},
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
      registered: true,
      tests: [],
      counts: {},
    });
  }

  return {
    id: project.id,
    name: project.name,
    created_at: project.created_at,
    environments: environments.map(envView),
    activeEnv: activeEnv?.name ?? null,
    features: [...byFeature.values()].sort((a, b) => a.feature.localeCompare(b.feature)),
    recordings: db.listRecordings(project.id).map((r) => ({ id: r.id, name: r.name, path: r.path })),
    recentRuns: activeEnv
      ? db
          .listRuns(project.id, activeEnv.id, 10)
          .map((r) => ({ id: r.id, feature: r.feature, env: r.env_id, status: r.status, started_at: r.started_at }))
      : [],
    totals,
  };
}
