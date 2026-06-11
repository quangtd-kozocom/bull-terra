import type { Db } from "../core/db.js";
import { discoverTests } from "../core/discover.js";
import { projectSpecsDir, type ProjectPaths } from "../core/paths.js";
import type { Project } from "../core/types.js";

export interface TestView {
  testId: string;
  tcId: string | null;
  title: string;
  /** Latest observed status, or "ungenerated"/"never-run". */
  status: string;
  baseline: string | null;
  error: string | null;
  tracePath: string | null;
  durationMs: number | null;
}

export interface FeatureView {
  feature: string;
  specRelPath: string;
  tests: TestView[];
  counts: Record<string, number>;
}

export interface ProjectView extends Project {
  features: FeatureView[];
  recordings: { id: number; name: string; path: string }[];
  recentRuns: { id: number; feature: string | null; status: string; started_at: string }[];
  totals: { tests: number; passed: number; failed: number; never: number };
}

/** Assemble the full dashboard view for a project: convention-discovered tests
 *  joined with their latest result and baseline. No sheet/MCP call needed. */
export function buildProjectView(db: Db, paths: ProjectPaths, project: Project): ProjectView {
  const specsDir = projectSpecsDir(paths, project.name);
  const discovered = discoverTests(specsDir);
  const latest = db.latestResultsByTest(project.id);
  const baselines = new Map(db.listBaselines(project.id).map((b) => [b.test_id, b.last_known_status]));

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
      fv = { feature: t.feature, specRelPath: t.specRelPath, tests: [], counts: {} };
      byFeature.set(t.feature, fv);
    }
    fv.tests.push(view);
    fv.counts[status] = (fv.counts[status] ?? 0) + 1;
    totals.tests++;
    if (status === "passed") totals.passed++;
    else if (status === "never-run") totals.never++;
    else totals.failed++;
  }

  return {
    ...project,
    features: [...byFeature.values()].sort((a, b) => a.feature.localeCompare(b.feature)),
    recordings: db.listRecordings(project.id).map((r) => ({ id: r.id, name: r.name, path: r.path })),
    recentRuns: db
      .listRuns(project.id, 10)
      .map((r) => ({ id: r.id, feature: r.feature, status: r.status, started_at: r.started_at })),
    totals,
  };
}
