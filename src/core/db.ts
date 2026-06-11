import Database from "better-sqlite3";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  baselines,
  DDL,
  environments,
  features,
  migrateFeatureRecordingOptions,
  migrateFeatureScopedRecordings,
  migrateLegacyCredVars,
  projects,
  recordings,
  results,
  runs,
  schema,
} from "./schema.js";
import type {
  Baseline,
  BaselineStatus,
  Environment,
  Feature,
  ParsedTestResult,
  Project,
  Recording,
  Result,
  Run,
  RunStatus,
  RunSummary,
  TestHistoryEntry,
} from "./types.js";

/**
 * Typed data-access facade over the local SQLite file. Drizzle is the query
 * layer; callers (engine, server, CLI) only ever see these methods, so the ORM
 * never leaks past this class. Fully synchronous — the better-sqlite3 driver
 * keeps every call sync, so nothing upstream needs async.
 */
export class Db {
  private readonly sqlite: Database.Database;
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.exec(DDL);
    migrateLegacyCredVars(this.sqlite);
    migrateFeatureScopedRecordings(this.sqlite);
    migrateFeatureRecordingOptions(this.sqlite);
    this.db = drizzle(this.sqlite, { schema });
  }

  close(): void {
    this.sqlite.close();
  }

  // ---- projects ----------------------------------------------------------

  createProject(name: string): Project {
    return this.db.insert(projects).values({ name }).returning().get();
  }

  /** Create the project if missing; otherwise return the existing one (name is the identity). */
  upsertProject(name: string): Project {
    return this.getProjectByName(name) ?? this.createProject(name);
  }

  getProject(id: number): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  getProjectByName(name: string): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.name, name)).get();
  }

  listProjects(): Project[] {
    return this.db.select().from(projects).orderBy(projects.name).all();
  }

  deleteProject(id: number): void {
    this.db.delete(projects).where(eq(projects.id, id)).run();
  }

  renameProject(id: number, name: string): Project {
    this.db.update(projects).set({ name }).where(eq(projects.id, id)).run();
    return this.getProject(id)!;
  }

  // ---- environments ------------------------------------------------------

  /**
   * Add or update an environment. secret_vars are MERGED into any existing map
   * (keys you don't mention are kept), then keys in `unset` are removed — so a
   * re-run that touches one var never silently wipes the others.
   */
  upsertEnvironment(
    projectId: number,
    name: string,
    url: string,
    opts: {
      secretVars?: Record<string, string>;
      unset?: string[];
      isDefault?: boolean;
    } = {},
  ): Environment {
    const existing = this.getEnvironment(projectId, name);
    const merged = { ...existing?.secret_vars, ...opts.secretVars };
    for (const key of opts.unset ?? []) delete merged[key];

    if (existing) {
      this.db
        .update(environments)
        .set({ url, secret_vars: merged })
        .where(eq(environments.id, existing.id))
        .run();
      if (opts.isDefault) this.setDefaultEnvironment(projectId, existing.id);
      return this.getEnvironmentById(existing.id)!;
    }

    const created = this.db
      .insert(environments)
      .values({ project_id: projectId, name, url, secret_vars: merged })
      .returning()
      .get();
    // First env for a project is the default; or honor an explicit request.
    const total = this.db
      .select({ n: count() })
      .from(environments)
      .where(eq(environments.project_id, projectId))
      .get();
    if (opts.isDefault || total?.n === 1) this.setDefaultEnvironment(projectId, created.id);
    return this.getEnvironmentById(created.id)!;
  }

  getEnvironmentById(id: number): Environment | undefined {
    return this.db.select().from(environments).where(eq(environments.id, id)).get();
  }

  getEnvironment(projectId: number, name: string): Environment | undefined {
    return this.db
      .select()
      .from(environments)
      .where(and(eq(environments.project_id, projectId), eq(environments.name, name)))
      .get();
  }

  listEnvironments(projectId: number): Environment[] {
    return this.db
      .select()
      .from(environments)
      .where(eq(environments.project_id, projectId))
      .orderBy(desc(environments.is_default), environments.name)
      .all();
  }

  getDefaultEnvironment(projectId: number): Environment | undefined {
    return (
      this.db
        .select()
        .from(environments)
        .where(and(eq(environments.project_id, projectId), eq(environments.is_default, 1)))
        .get() ??
      this.db
        .select()
        .from(environments)
        .where(eq(environments.project_id, projectId))
        .orderBy(environments.id)
        .get()
    );
  }

  setDefaultEnvironment(projectId: number, envId: number): void {
    this.db.transaction((tx) => {
      tx.update(environments)
        .set({ is_default: 0 })
        .where(eq(environments.project_id, projectId))
        .run();
      tx.update(environments)
        .set({ is_default: 1 })
        .where(and(eq(environments.id, envId), eq(environments.project_id, projectId)))
        .run();
    });
  }

  deleteEnvironment(projectId: number, name: string): boolean {
    const env = this.getEnvironment(projectId, name);
    if (!env) return false;
    const wasDefault = env.is_default === 1;
    this.db.delete(environments).where(eq(environments.id, env.id)).run();
    // Promote another env to default if we removed the default one.
    if (wasDefault) {
      const next = this.db
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.project_id, projectId))
        .orderBy(environments.id)
        .get();
      if (next) this.setDefaultEnvironment(projectId, next.id);
    }
    return true;
  }

  /** Explicit edit (dashboard): REPLACES secret_vars with exactly the given map. */
  updateEnvironment(
    projectId: number,
    currentName: string,
    next: { name: string; url: string; secretVars: Record<string, string> },
  ): Environment | undefined {
    const existing = this.getEnvironment(projectId, currentName);
    if (!existing) return undefined;
    this.db
      .update(environments)
      .set({ name: next.name, url: next.url, secret_vars: next.secretVars })
      .where(eq(environments.id, existing.id))
      .run();
    return this.getEnvironmentById(existing.id);
  }

  // ---- features ----------------------------------------------------------

  upsertFeature(
    projectId: number,
    name: string,
    sheetId?: string | null,
    opts: { startPath?: string; requiresAuth?: boolean } = {},
  ): Feature {
    const existing = this.getFeature(projectId, name);
    if (existing) {
      this.db
        .update(features)
        .set({
          sheet_id: sheetId ?? existing.sheet_id,
          start_path: opts.startPath ?? existing.start_path,
          requires_auth: opts.requiresAuth == null ? existing.requires_auth : opts.requiresAuth ? 1 : 0,
        })
        .where(eq(features.id, existing.id))
        .run();
      return this.getFeatureById(existing.id)!;
    }
    return this.db
      .insert(features)
      .values({
        project_id: projectId,
        name,
        sheet_id: sheetId ?? null,
        start_path: opts.startPath ?? "/",
        requires_auth: opts.requiresAuth ? 1 : 0,
      })
      .returning()
      .get();
  }

  getFeatureById(id: number): Feature | undefined {
    return this.db.select().from(features).where(eq(features.id, id)).get();
  }

  getFeature(projectId: number, name: string): Feature | undefined {
    return this.db
      .select()
      .from(features)
      .where(and(eq(features.project_id, projectId), eq(features.name, name)))
      .get();
  }

  listFeatures(projectId: number): Feature[] {
    return this.db
      .select()
      .from(features)
      .where(eq(features.project_id, projectId))
      .orderBy(features.name)
      .all();
  }

  deleteFeature(projectId: number, name: string): boolean {
    const info = this.db
      .delete(features)
      .where(and(eq(features.project_id, projectId), eq(features.name, name)))
      .run();
    return info.changes > 0;
  }

  updateFeature(
    projectId: number,
    currentName: string,
    next: { name: string; sheetId?: string | null; startPath: string; requiresAuth: boolean },
  ): Feature | undefined {
    const existing = this.getFeature(projectId, currentName);
    if (!existing) return undefined;
    this.db.transaction((tx) => {
      tx.update(features)
        .set({
          name: next.name,
          sheet_id: next.sheetId ?? null,
          start_path: next.startPath,
          requires_auth: next.requiresAuth ? 1 : 0,
        })
        .where(eq(features.id, existing.id))
        .run();
      tx.update(runs)
        .set({ feature: next.name })
        .where(and(eq(runs.project_id, projectId), eq(runs.feature, currentName)))
        .run();

      // Rewrite the feature prefix embedded in stored test ids (`<feature>.spec.ts>…`).
      const oldPrefix = `${currentName}.spec.ts>`;
      const newPrefix = `${next.name}.spec.ts>`;
      tx.run(
        sql`UPDATE results
            SET test_id = ${newPrefix} || substr(test_id, ${oldPrefix.length} + 1)
            WHERE run_id IN (SELECT id FROM runs WHERE project_id = ${projectId})
              AND substr(test_id, 1, ${oldPrefix.length}) = ${oldPrefix}`,
      );
      tx.run(
        sql`UPDATE baselines
            SET test_id = ${newPrefix} || substr(test_id, ${oldPrefix.length} + 1)
            WHERE project_id = ${projectId}
              AND substr(test_id, 1, ${oldPrefix.length}) = ${oldPrefix}`,
      );
    });
    return this.getFeatureById(existing.id);
  }

  // ---- recordings --------------------------------------------------------

  addRecording(projectId: number, name: string, path: string): Recording {
    const existing = this.getRecording(projectId, null, name);
    if (existing) {
      this.db.update(recordings).set({ path }).where(eq(recordings.id, existing.id)).run();
      return this.getRecordingById(existing.id)!;
    }
    return this.db.insert(recordings).values({ project_id: projectId, name, path }).returning().get();
  }

  addFeatureRecording(projectId: number, featureId: number, name: string, path: string): Recording {
    const existing = this.getRecording(projectId, featureId, name);
    if (existing) {
      this.db.update(recordings).set({ path }).where(eq(recordings.id, existing.id)).run();
      return this.getRecordingById(existing.id)!;
    }
    return this.db
      .insert(recordings)
      .values({ project_id: projectId, feature_id: featureId, name, path })
      .returning()
      .get();
  }

  getRecordingById(id: number): Recording | undefined {
    return this.db.select().from(recordings).where(eq(recordings.id, id)).get();
  }

  getRecording(projectId: number, featureId: number | null, name: string): Recording | undefined {
    const featureFilter =
      featureId == null ? sql`${recordings.feature_id} IS NULL` : eq(recordings.feature_id, featureId);
    return this.db
      .select()
      .from(recordings)
      .where(and(eq(recordings.project_id, projectId), featureFilter, eq(recordings.name, name)))
      .get();
  }

  listRecordings(projectId: number): Recording[] {
    return this.db
      .select()
      .from(recordings)
      .where(eq(recordings.project_id, projectId))
      .orderBy(desc(recordings.created_at))
      .all();
  }

  listFeatureRecordings(projectId: number, featureId: number): Recording[] {
    return this.db
      .select()
      .from(recordings)
      .where(and(eq(recordings.project_id, projectId), eq(recordings.feature_id, featureId)))
      .orderBy(sql`CASE WHEN ${recordings.name} = 'base' THEN 0 ELSE 1 END`, recordings.name)
      .all();
  }

  updateRecordingPath(id: number, path: string): Recording | undefined {
    this.db.update(recordings).set({ path }).where(eq(recordings.id, id)).run();
    return this.getRecordingById(id);
  }

  deleteRecording(id: number): boolean {
    const info = this.db.delete(recordings).where(eq(recordings.id, id)).run();
    return info.changes > 0;
  }

  // ---- runs --------------------------------------------------------------

  startRun(projectId: number, envId: number, feature: string | null): Run {
    return this.db
      .insert(runs)
      .values({ project_id: projectId, env_id: envId, feature })
      .returning()
      .get();
  }

  finishRun(runId: number, status: RunStatus): void {
    this.db
      .update(runs)
      .set({ status, finished_at: sql`datetime('now')` })
      .where(eq(runs.id, runId))
      .run();
  }

  getRun(id: number): Run | undefined {
    return this.db.select().from(runs).where(eq(runs.id, id)).get();
  }

  listRuns(projectId: number, envId?: number, limit = 50): Run[] {
    const where =
      envId != null
        ? and(eq(runs.project_id, projectId), eq(runs.env_id, envId))
        : eq(runs.project_id, projectId);
    return this.db
      .select()
      .from(runs)
      .where(where)
      .orderBy(desc(runs.started_at))
      .limit(limit)
      .all();
  }

  /** Recent runs with per-run result tallies (newest first), for the history timeline. */
  listRunSummaries(projectId: number, envId: number, limit = 30): RunSummary[] {
    return this.db
      .select({
        id: runs.id,
        feature: runs.feature,
        status: runs.status,
        started_at: runs.started_at,
        finished_at: runs.finished_at,
        passed: sql<number>`coalesce(sum(${results.status} = 'passed'), 0)`,
        failed: sql<number>`coalesce(sum(${results.status} IN ('failed','timedOut','interrupted')), 0)`,
        skipped: sql<number>`coalesce(sum(${results.status} = 'skipped'), 0)`,
        duration_ms: sql<number>`coalesce(sum(${results.duration_ms}), 0)`,
      })
      .from(runs)
      .leftJoin(results, eq(results.run_id, runs.id))
      .where(and(eq(runs.project_id, projectId), eq(runs.env_id, envId)))
      .groupBy(runs.id)
      .orderBy(desc(runs.started_at), desc(runs.id))
      .limit(limit)
      .all();
  }

  // ---- results -----------------------------------------------------------

  recordResult(runId: number, r: ParsedTestResult): void {
    this.db
      .insert(results)
      .values({
        run_id: runId,
        test_id: r.testId,
        title: r.title,
        status: r.status,
        error: r.error,
        trace_path: r.tracePath,
        duration_ms: r.durationMs,
      })
      .run();
  }

  listResults(runId: number): Result[] {
    return this.db.select().from(results).where(eq(results.run_id, runId)).orderBy(results.id).all();
  }

  /** Latest known result per test for a project+env (most recent run wins). */
  latestResultsByTest(projectId: number, envId: number): Map<string, Result> {
    const rows = this.db
      .select({ r: results })
      .from(results)
      .innerJoin(runs, eq(runs.id, results.run_id))
      .where(and(eq(runs.project_id, projectId), eq(runs.env_id, envId)))
      .orderBy(desc(results.id))
      .all();
    const map = new Map<string, Result>();
    for (const { r } of rows) if (!map.has(r.test_id)) map.set(r.test_id, r);
    return map;
  }

  /**
   * Recent result history for EVERY test on one env in a single query (newest
   * first, capped per test). Same scan as latestResultsByTest, richer payload —
   * feeds the per-test sparklines and the dashboard's flaky flag.
   */
  historiesByTest(projectId: number, envId: number, perTest = 10): Map<string, TestHistoryEntry[]> {
    const rows = this.db
      .select({
        test_id: results.test_id,
        status: results.status,
        duration_ms: results.duration_ms,
        run_id: results.run_id,
        started_at: runs.started_at,
      })
      .from(results)
      .innerJoin(runs, eq(runs.id, results.run_id))
      .where(and(eq(runs.project_id, projectId), eq(runs.env_id, envId)))
      .orderBy(desc(results.id))
      .all();
    const map = new Map<string, TestHistoryEntry[]>();
    for (const row of rows) {
      let list = map.get(row.test_id);
      if (!list) map.set(row.test_id, (list = []));
      if (list.length < perTest) {
        list.push({
          runId: row.run_id,
          status: row.status,
          durationMs: row.duration_ms,
          at: row.started_at,
        });
      }
    }
    return map;
  }

  /** Status history for a single test on one env (newest first), used for flaky detection. */
  statusHistory(projectId: number, envId: number, testId: string, limit = 10): string[] {
    return this.db
      .select({ status: results.status })
      .from(results)
      .innerJoin(runs, eq(runs.id, results.run_id))
      .where(
        and(eq(runs.project_id, projectId), eq(runs.env_id, envId), eq(results.test_id, testId)),
      )
      .orderBy(desc(results.id))
      .limit(limit)
      .all()
      .map((x) => x.status);
  }

  // ---- baselines ---------------------------------------------------------

  getBaseline(projectId: number, envId: number, testId: string): Baseline | undefined {
    return this.db
      .select()
      .from(baselines)
      .where(
        and(
          eq(baselines.project_id, projectId),
          eq(baselines.env_id, envId),
          eq(baselines.test_id, testId),
        ),
      )
      .get();
  }

  listBaselines(projectId: number, envId: number): Baseline[] {
    return this.db
      .select()
      .from(baselines)
      .where(and(eq(baselines.project_id, projectId), eq(baselines.env_id, envId)))
      .all();
  }

  setBaseline(projectId: number, envId: number, testId: string, status: BaselineStatus): void {
    this.db
      .insert(baselines)
      .values({
        project_id: projectId,
        env_id: envId,
        test_id: testId,
        last_known_status: status,
      })
      .onConflictDoUpdate({
        target: [baselines.project_id, baselines.env_id, baselines.test_id],
        set: { last_known_status: status, updated_at: sql`datetime('now')` },
      })
      .run();
  }
}

let _db: Db | null = null;

/** Process-wide singleton, opened lazily against the given path. */
export function openDb(dbPath: string): Db {
  if (!_db) _db = new Db(dbPath);
  return _db;
}
