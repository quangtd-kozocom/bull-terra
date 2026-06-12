import { serve } from "@hono/node-server";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  authRequirementError,
  authStateInfo,
  featureStartUrl,
  migrateAuthStateFiles,
  normalizeStartPath,
} from "../core/auth.js";
import {
  cleanProjectArtifacts,
  deleteRunArtifacts,
  deleteRunHistory,
  deleteRunVideos,
  deleteTestVideo,
  projectArtifactStats,
} from "../core/artifacts.js";
import { Db } from "../core/db.js";
import { discoverFeatures } from "../core/discover.js";
import { appendManualTest, readTestFromSpec, removeTestFromSpec, updateTestInSpec } from "../core/manual-tests.js";
import {
  envAuthStatePath,
  featureRecordingPath,
  featureRecordingsDir,
  projectRecordingsDir,
  projectSpecsDir,
  safePathSegment,
  type ProjectPaths,
} from "../core/paths.js";
import { chromiumInstalled, requirePlaywrightTest, resolvePlaywrightCli } from "../core/playwright.js";
import { normalizeSecretVars } from "../core/secret-vars.js";
import type { Environment, RunEvent } from "../core/types.js";
import { RunManager } from "./runManager.js";
import { buildProjectView } from "./views.js";

export interface ServerOptions {
  paths: ProjectPaths;
  port: number;
  serveUi: boolean;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const safeAssetName = safePathSegment;

function moveIfPossible(from: string, to: string): void {
  if (!existsSync(from) || from === to) return;
  if (existsSync(to)) throw new Error(`target already exists: ${to}`);
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

function assertMovePossible(from: string, to: string): void {
  if (existsSync(from) && from !== to && existsSync(to)) throw new Error(`target already exists: ${to}`);
}

function projectAuthStateMoves(paths: ProjectPaths, oldName: string, newName: string): [string, string][] {
  if (!existsSync(paths.authDir)) return [];
  const oldPrefix = `${safeAssetName(oldName)}-`;
  const newPrefix = `${safeAssetName(newName)}-`;
  const moves: [string, string][] = [];
  for (const entry of readdirSync(paths.authDir)) {
    if (!entry.startsWith(oldPrefix)) continue;
    moves.push([join(paths.authDir, entry), join(paths.authDir, `${newPrefix}${entry.slice(oldPrefix.length)}`)]);
  }
  return moves;
}

function assertProjectMoveTargets(paths: ProjectPaths, oldName: string, newName: string): void {
  assertMovePossible(projectSpecsDir(paths, oldName), projectSpecsDir(paths, newName));
  assertMovePossible(projectRecordingsDir(paths, oldName), projectRecordingsDir(paths, newName));
  for (const [from, to] of projectAuthStateMoves(paths, oldName, newName)) assertMovePossible(from, to);
}

function moveProjectAuthStates(paths: ProjectPaths, oldName: string, newName: string): void {
  for (const [from, to] of projectAuthStateMoves(paths, oldName, newName)) moveIfPossible(from, to);
}

function moveEnvAuthState(paths: ProjectPaths, projectName: string, oldName: string, newName: string): void {
  moveIfPossible(
    envAuthStatePath(paths, projectName, oldName),
    envAuthStatePath(paths, projectName, newName),
  );
}

async function captureAuthState(paths: ProjectPaths, env: Environment, storagePath: string): Promise<void> {
  const { chromium } = requirePlaywrightTest(paths.root);
  mkdirSync(dirname(storagePath), { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(env.url);
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    page.on("close", finish);
    browser.on("disconnected", finish);
  });
  if (!browser.isConnected()) throw new Error("browser closed before auth state could be saved");
  await context.storageState({ path: storagePath });
  await browser.close();
}

export function createApp(opts: ServerOptions): Hono {
  const { paths } = opts;
  const db = new Db(paths.dbPath);
  migrateAuthStateFiles(db, paths); // legacy auth/<p>-<e>.json → recordings/<p>/.auth/<e>.json
  const runs = new RunManager();
  const app = new Hono();

  const getProjectOr404 = (name: string) => db.getProjectByName(name);

  // ---- API ---------------------------------------------------------------
  app.get("/api/health", (c) => c.json({ ok: true, root: paths.root }));

  app.get("/api/projects", (c) =>
    c.json(db.listProjects().map((p) => buildProjectView(db, paths, p))),
  );

  app.post("/api/projects", async (c) => {
    const body = await c.req.json<{ name: string }>();
    if (!body?.name) return c.json({ error: "name is required" }, 400);
    return c.json(buildProjectView(db, paths, db.upsertProject(body.name)));
  });

  app.get("/api/projects/:name", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    return c.json(buildProjectView(db, paths, p, c.req.query("env")));
  });

  app.delete("/api/projects/:name", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    db.deleteProject(p.id);
    return c.json({ ok: true });
  });

  app.put("/api/projects/:name", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{ name: string }>().catch(() => null);
    const name = body?.name?.trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    if (name !== p.name && db.getProjectByName(name))
      return c.json({ error: `project "${name}" already exists` }, 409);
    try {
      assertProjectMoveTargets(paths, p.name, name);
      const renamed = db.renameProject(p.id, name);
      moveIfPossible(projectSpecsDir(paths, p.name), projectSpecsDir(paths, name));
      moveIfPossible(projectRecordingsDir(paths, p.name), projectRecordingsDir(paths, name));
      moveProjectAuthStates(paths, p.name, name);
      return c.json(buildProjectView(db, paths, renamed));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });

  // ---- environments ------------------------------------------------------
  app.post("/api/projects/:name/environments", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const body = await c.req
      .json<{ name: string; url: string; secretVars?: Record<string, unknown>; isDefault?: boolean }>()
      .catch(() => null);
    if (!body?.name || !body?.url) return c.json({ error: "name and url are required" }, 400);
    try {
      db.upsertEnvironment(p.id, body.name, body.url, {
        secretVars: normalizeSecretVars(body.secretVars ?? {}),
        isDefault: body.isDefault,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    return c.json(buildProjectView(db, paths, p, body.name));
  });

  app.put("/api/projects/:name/environments/:env/default", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const env = db.getEnvironment(p.id, c.req.param("env"));
    if (!env) return c.json({ error: "no such environment" }, 404);
    db.setDefaultEnvironment(p.id, env.id);
    return c.json(buildProjectView(db, paths, p, env.name));
  });

  app.delete("/api/projects/:name/environments/:env", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    db.deleteEnvironment(p.id, c.req.param("env"));
    return c.json(buildProjectView(db, paths, p));
  });

  app.put("/api/projects/:name/environments/:env", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const currentName = c.req.param("env");
    const current = db.getEnvironment(p.id, currentName);
    if (!current) return c.json({ error: "no such environment" }, 404);
    const body = await c.req
      .json<{ name: string; url: string; secretVars?: Record<string, unknown> }>()
      .catch(() => null);
    const name = body?.name?.trim();
    const url = body?.url?.trim();
    if (!name || !url) return c.json({ error: "name and url are required" }, 400);
    const conflict = name !== currentName ? db.getEnvironment(p.id, name) : undefined;
    if (conflict) return c.json({ error: `environment "${name}" already exists` }, 409);
    try {
      moveEnvAuthState(paths, p.name, currentName, name);
      db.updateEnvironment(p.id, currentName, {
        name,
        url,
        secretVars: normalizeSecretVars(body?.secretVars ?? {}),
      });
      return c.json(buildProjectView(db, paths, p, name));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });

  app.post("/api/projects/:name/environments/:env/auth/capture", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const env = db.getEnvironment(p.id, c.req.param("env"));
    if (!env) return c.json({ error: "no such environment" }, 404);
    if (!chromiumInstalled())
      return c.json(
        { error: "Chromium isn't installed. Run `bull-terra install-browsers` in your terminal." },
        400,
      );
    const auth = authStateInfo(paths, p, env);
    try {
      await captureAuthState(paths, env, auth.path);
      return c.json({ ok: true, path: auth.relPath });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // Read the stored Playwright storageState (cookies / localStorage) for an env.
  app.get("/api/projects/:name/environments/:env/auth/state", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const env = db.getEnvironment(p.id, c.req.param("env"));
    if (!env) return c.json({ error: "no such environment" }, 404);
    const auth = authStateInfo(paths, p, env);
    if (!auth.exists)
      return c.json({ error: "No auth state captured yet — use “Login once” first." }, 404);
    try {
      return c.json({
        env: env.name,
        path: auth.relPath,
        updatedAt: auth.updatedAt,
        source: readFileSync(auth.path, "utf8"),
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // ---- features ----------------------------------------------------------
  app.post("/api/projects/:name/features", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const body = await c.req
      .json<{ name: string; sheetId?: string; startPath?: string; requiresAuth?: boolean }>()
      .catch(() => null);
    if (!body?.name) return c.json({ error: "name is required" }, 400);
    try {
      db.upsertFeature(p.id, body.name, body.sheetId ?? null, {
        startPath: normalizeStartPath(body.startPath),
        requiresAuth: !!body.requiresAuth,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    return c.json(buildProjectView(db, paths, p));
  });

  app.delete("/api/projects/:name/features/:feature", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    db.deleteFeature(p.id, c.req.param("feature"));
    return c.json(buildProjectView(db, paths, p));
  });

  app.put("/api/projects/:name/features/:feature", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const currentName = c.req.param("feature");
    const current = db.getFeature(p.id, currentName);
    if (!current) return c.json({ error: "no such feature" }, 404);
    const body = await c.req
      .json<{ name: string; sheetId?: string | null; startPath?: string; requiresAuth?: boolean }>()
      .catch(() => null);
    const name = body?.name?.trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const conflict = name !== currentName ? db.getFeature(p.id, name) : undefined;
    if (conflict) return c.json({ error: `feature "${name}" already exists` }, 409);
    try {
      const recordings = db.listFeatureRecordings(p.id, current.id);
      const oldSpecPath = join(projectSpecsDir(paths, p.name), `${currentName}.spec.ts`);
      const newSpecPath = join(projectSpecsDir(paths, p.name), `${name}.spec.ts`);
      const oldRecordingsDir = featureRecordingsDir(paths, p.name, currentName);
      const newRecordingsDir = featureRecordingsDir(paths, p.name, name);
      assertMovePossible(oldSpecPath, newSpecPath);
      assertMovePossible(oldRecordingsDir, newRecordingsDir);
      moveIfPossible(oldSpecPath, newSpecPath);
      moveIfPossible(oldRecordingsDir, newRecordingsDir);
      for (const recording of recordings) {
        db.updateRecordingPath(recording.id, join(newRecordingsDir, basename(recording.path)));
      }
      db.updateFeature(p.id, currentName, {
        name,
        sheetId: body?.sheetId?.trim() || null,
        startPath: normalizeStartPath(body?.startPath ?? current.start_path),
        requiresAuth: body?.requiresAuth ?? current.requires_auth === 1,
      });
      return c.json(buildProjectView(db, paths, p));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });

  app.delete("/api/projects/:name/features/:feature/tests", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const title = c.req.query("title");
    if (!title) return c.json({ error: "title is required" }, 400);
    const specPath = join(projectSpecsDir(paths, p.name), `${c.req.param("feature")}.spec.ts`);
    if (!removeTestFromSpec(specPath, title)) return c.json({ error: "test not found" }, 404);
    return c.json(buildProjectView(db, paths, p, c.req.query("env")));
  });

  app.get("/api/projects/:name/features/:feature/tests", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const title = c.req.query("title");
    if (!title) return c.json({ error: "title is required" }, 400);
    const feature = c.req.param("feature");
    const specPath = join(projectSpecsDir(paths, p.name), `${feature}.spec.ts`);
    const test = readTestFromSpec(specPath, title);
    if (!test) return c.json({ error: "test not found" }, 404);
    return c.json({ feature, specPath, ...test });
  });

  app.put("/api/projects/:name/features/:feature/tests", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const oldTitle = c.req.query("title");
    if (!oldTitle) return c.json({ error: "title is required" }, 400);
    const body = await c.req.json<{ title?: string; source?: string }>().catch(() => null);
    if (typeof body?.title !== "string" || typeof body?.source !== "string")
      return c.json({ error: "title and source are required" }, 400);
    const feature = c.req.param("feature");
    const specPath = join(projectSpecsDir(paths, p.name), `${feature}.spec.ts`);
    try {
      const test = updateTestInSpec(specPath, oldTitle, { title: body.title, source: body.source });
      if (!test) return c.json({ error: "test not found" }, 404);
      return c.json({
        project: buildProjectView(db, paths, p, c.req.query("env")),
        test: { feature, specPath, ...test },
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // Disk usage of run artifacts (videos/traces), per run + total.
  app.get("/api/projects/:name/artifacts", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    return c.json(projectArtifactStats(db, paths, p));
  });

  // Delete every run's artifacts (optionally keeping the newest ?keep=N runs).
  app.delete("/api/projects/:name/artifacts", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const keep = Math.max(0, Number(c.req.query("keep")) || 0);
    return c.json(cleanProjectArtifacts(db, paths, p, keep));
  });

  // Delete one run's artifacts; the run row and its results stay for history.
  app.delete("/api/projects/:name/runs/:runId/artifacts", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const run = db.getRun(Number(c.req.param("runId")));
    if (!run || run.project_id !== p.id) return c.json({ error: "run not found" }, 404);
    return c.json({ freedBytes: deleteRunArtifacts(db, paths, p, run.id) });
  });

  app.get("/api/projects/:name/runs", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const envName = c.req.query("env");
    const env = envName ? db.getEnvironment(p.id, envName) : db.getDefaultEnvironment(p.id);
    if (!env) return c.json({ error: "environment not found" }, 404);
    const limit = Math.min(Number(c.req.query("limit")) || 30, 200);
    return c.json(db.listRunSummaries(p.id, env.id, limit));
  });

  // Erase runs from history (results + artifacts + the run rows themselves).
  // ?ids=1,2,3 deletes those runs; without ids, every run on the env is erased.
  app.delete("/api/projects/:name/runs", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const idsParam = c.req.query("ids");
    let runIds: number[];
    if (idsParam) {
      runIds = idsParam.split(",").map(Number);
      if (runIds.some((id) => !Number.isInteger(id))) return c.json({ error: "invalid ids" }, 400);
      const foreign = runIds.find((id) => db.getRun(id)?.project_id !== p.id);
      if (foreign != null) return c.json({ error: `run ${foreign} not found` }, 404);
    } else {
      const envName = c.req.query("env");
      const env = envName ? db.getEnvironment(p.id, envName) : db.getDefaultEnvironment(p.id);
      if (!env) return c.json({ error: "environment not found" }, 404);
      runIds = db.listRuns(p.id, env.id, 10_000).map((run) => run.id);
    }
    // Never delete a run that's still in flight — the runner is writing to it.
    runIds = runIds.filter((id) => db.getRun(id)?.status !== "running");
    return c.json(deleteRunHistory(db, paths, p, runIds));
  });

  // Recorded test videos (screencasts) on one env, newest first.
  app.get("/api/projects/:name/screencasts", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const envName = c.req.query("env");
    const env = envName ? db.getEnvironment(p.id, envName) : db.getDefaultEnvironment(p.id);
    if (!env) return c.json({ error: "environment not found" }, 404);
    const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
    return c.json(db.listScreencasts(p.id, env.id, limit));
  });

  app.delete("/api/projects/:name/screencasts", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const runId = Number(c.req.query("runId"));
    if (!Number.isInteger(runId)) return c.json({ error: "runId is required" }, 400);
    const run = db.getRun(runId);
    if (!run || run.project_id !== p.id) return c.json({ error: "run not found" }, 404);
    const testId = c.req.query("testId");
    return c.json(testId ? deleteTestVideo(db, paths, run.id, testId) : deleteRunVideos(db, paths, run.id));
  });

  app.get("/api/projects/:name/runs/:runId", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const run = db.getRun(Number(c.req.param("runId")));
    if (!run || run.project_id !== p.id) return c.json({ error: "run not found" }, 404);
    const results = db.listResults(run.id).map((r) => ({
      testId: r.test_id,
      title: r.title,
      status: r.status,
      error: r.error,
      tracePath: r.trace_path,
      videoPath: r.video_path,
      durationMs: r.duration_ms,
    }));
    return c.json({ run, results });
  });

  app.get("/api/projects/:name/recordings/:recordingId", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const recording = db.getRecordingById(Number(c.req.param("recordingId")));
    if (!recording || recording.project_id !== p.id) return c.json({ error: "recording not found" }, 404);
    const feature = recording.feature_id == null ? null : db.getFeatureById(recording.feature_id)?.name ?? null;
    try {
      return c.json({
        id: recording.id,
        name: recording.name,
        path: recording.path,
        feature,
        isPrimary: recording.name === "base",
        created_at: recording.created_at,
        source: readFileSync(recording.path, "utf8"),
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // Save edited recording source back to disk (feeds /gen-tests + promote).
  app.put("/api/projects/:name/recordings/:recordingId", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const recording = db.getRecordingById(Number(c.req.param("recordingId")));
    if (!recording || recording.project_id !== p.id) return c.json({ error: "recording not found" }, 404);
    const body = await c.req.json<{ source?: string }>().catch(() => null);
    if (typeof body?.source !== "string") return c.json({ error: "source is required" }, 400);
    if (!existsSync(recording.path)) return c.json({ error: "recording file no longer exists" }, 404);
    try {
      writeFileSync(recording.path, body.source, "utf8");
      const feature = recording.feature_id == null ? null : db.getFeatureById(recording.feature_id)?.name ?? null;
      return c.json({
        id: recording.id,
        name: recording.name,
        path: recording.path,
        feature,
        isPrimary: recording.name === "base",
        created_at: recording.created_at,
        source: body.source,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.delete("/api/projects/:name/recordings/:recordingId", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const recording = db.getRecordingById(Number(c.req.param("recordingId")));
    if (!recording || recording.project_id !== p.id) return c.json({ error: "recording not found" }, 404);
    db.deleteRecording(recording.id);
    if (existsSync(recording.path)) unlinkSync(recording.path);
    return c.json(buildProjectView(db, paths, p, c.req.query("env")));
  });

  app.post("/api/projects/:name/recordings/:recordingId/promote", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const recording = db.getRecordingById(Number(c.req.param("recordingId")));
    if (!recording || recording.project_id !== p.id) return c.json({ error: "recording not found" }, 404);
    if (recording.feature_id == null)
      return c.json({ error: "only feature-scoped recordings can be promoted to tests" }, 400);
    const feature = db.getFeatureById(recording.feature_id);
    if (!feature) return c.json({ error: "recording feature no longer exists" }, 404);
    const body = await c.req.json<{ tcId: string; title: string }>().catch(() => null);
    if (!body?.tcId || !body?.title) return c.json({ error: "tcId and title are required" }, 400);
    try {
      const specPath = join(projectSpecsDir(paths, p.name), `${feature.name}.spec.ts`);
      const result = appendManualTest(specPath, readFileSync(recording.path, "utf8"), body.tcId, body.title);
      return c.json({ ok: true, feature: feature.name, specPath, ...result });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // The app↔Claude Code seam (PRD §7.1): the copyable generation command.
  app.get("/api/projects/:name/gen-command", (c) => {
    const name = c.req.param("name");
    const feature = c.req.query("feature") ?? "<feature>";
    return c.json({ command: `claude "/gen-tests ${name} ${feature}"` });
  });

  // ---- live run (SSE) ----------------------------------------------------
  app.get("/api/projects/:name/run", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const envName = c.req.query("env");
    const env = envName ? db.getEnvironment(p.id, envName) : db.getDefaultEnvironment(p.id);
    if (!env) return c.json({ error: "no environment to run against" }, 400);
    const featureParam = c.req.query("feature");
    const specsDir = projectSpecsDir(paths, p.name);
    const features = featureParam ? [featureParam] : discoverFeatures(specsDir);
    for (const featureName of features) {
      const feature = db.getFeature(p.id, featureName);
      if (!feature) continue;
      const error = authRequirementError(paths, p, env, feature);
      if (error) return c.json({ error }, 400);
    }

    // Per-test "record video" selection (repeated ?videoTest=<testId>).
    const videoTestIds = c.req.queries("videoTest") ?? [];
    const testTitles = c.req.queries("testTitle");

    return streamSSE(c, async (stream) => {
      const send = (e: RunEvent) =>
        stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => {});
      // Allow the client to abort by closing the connection.
      stream.onAbort(() => {
        runs.stop();
      });
      await runs.run(
        db,
        paths,
        p,
        env,
        features.length ? features : undefined,
        testTitles?.length ? testTitles : undefined,
        send,
        videoTestIds,
      );
    });
  });

  app.post("/api/run/stop", (c) => c.json({ stopped: runs.stop() }));

  // ---- record (codegen, server-side; local tool) -------------------------
  async function runCodegenRecording(opts: {
    url: string;
    outPath: string;
    loadStoragePath?: string;
  }): Promise<{ ok: boolean; err: string }> {
    const cli = resolvePlaywrightCli(paths.root);
    const storageArgs = opts.loadStoragePath ? ["--load-storage", opts.loadStoragePath] : [];
    const result = await new Promise<{ ok: boolean; err: string }>((resolve) => {
      let stderr = "";
      const child = spawn(
        cli.command,
        [
          ...cli.prefix,
          "codegen",
          opts.url,
          ...storageArgs,
          "--output",
          opts.outPath,
          "--target",
          "playwright-test",
        ],
        { cwd: paths.root, shell: process.platform === "win32" },
      );
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", (e) => resolve({ ok: false, err: e.message }));
      child.on("close", () => resolve({ ok: existsSync(opts.outPath), err: stderr.trim() }));
    });
    return result;
  }

  app.post("/api/projects/:name/record", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const body = await c.req
      .json<{ name?: string; url?: string; env?: string }>()
      .catch(() => ({}) as Record<string, never>);

    // Preflight: codegen can't open a browser that isn't installed.
    if (!chromiumInstalled())
      return c.json(
        { error: "Chromium isn't installed. Run `bull-terra install-browsers` in your terminal." },
        400,
      );

    const env = body?.env ? db.getEnvironment(p.id, body.env) : db.getDefaultEnvironment(p.id);
    if (!env && !body?.url)
      return c.json({ error: "no environment to record against — add one first" }, 400);

    const recName = body?.name || "base";
    const url = body?.url || env!.url;
    const auth = env ? authStateInfo(paths, p, env) : null;
    const dir = projectRecordingsDir(paths, p.name);
    mkdirSync(dir, { recursive: true });
    const outPath = join(dir, `${safePathSegment(recName)}.ts`);
    const result = await runCodegenRecording({
      url,
      outPath,
      loadStoragePath: auth?.exists ? auth.path : undefined,
    });

    if (!result.ok)
      return c.json(
        {
          error:
            result.err.split("\n").slice(-4).join("\n") ||
            "codegen closed without saving a recording",
        },
        400,
      );
    const rec = db.addRecording(p.id, recName, outPath);
    return c.json(rec);
  });

  app.post("/api/projects/:name/features/:feature/recordings", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const feature = db.getFeature(p.id, c.req.param("feature"));
    if (!feature) return c.json({ error: "no such feature" }, 404);
    const body = await c.req
      .json<{ name?: string; url?: string; env?: string }>()
      .catch(() => ({}) as Record<string, never>);

    if (!chromiumInstalled())
      return c.json(
        { error: "Chromium isn't installed. Run `bull-terra install-browsers` in your terminal." },
        400,
      );

    const env = body?.env ? db.getEnvironment(p.id, body.env) : db.getDefaultEnvironment(p.id);
    if (!env && !body?.url)
      return c.json({ error: "no environment to record against — add one first" }, 400);

    const recName = body?.name || "base";
    if (env) {
      const error = authRequirementError(paths, p, env, feature);
      if (error) return c.json({ error }, 400);
    }

    let url: string;
    try {
      url = body?.url || featureStartUrl(env!, feature);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    const auth = env ? authStateInfo(paths, p, env) : null;
    const outPath = featureRecordingPath(paths, p.name, feature.name, recName);
    mkdirSync(dirname(outPath), { recursive: true });
    const result = await runCodegenRecording({
      url,
      outPath,
      loadStoragePath: auth?.exists ? auth.path : undefined,
    });

    if (!result.ok)
      return c.json(
        {
          error:
            result.err.split("\n").slice(-4).join("\n") ||
            "codegen closed without saving a recording",
        },
        400,
      );
    const rec = db.addFeatureRecording(p.id, feature.id, recName, outPath);
    return c.json(rec);
  });

  // Serve a run artifact (video, trace zip) inline.
  // Only run-artifact locations are reachable: recordings/<p>/.runs/ for current
  // runs, test-results/ for runs recorded before the per-project layout.
  app.get("/api/artifact", (c) => {
    const rel = c.req.query("path");
    if (!rel) return c.json({ error: "path is required" }, 400);
    const abs = resolve(paths.root, rel);
    const allowed =
      abs.startsWith(paths.tracesDir + sep) ||
      (abs.startsWith(paths.recordingsDir + sep) && abs.includes(`${sep}.runs${sep}`));
    if (!allowed) {
      return c.json({ error: "path must be a run artifact" }, 400);
    }
    if (!existsSync(abs)) return c.json({ error: "artifact not found" }, 404);
    return new Response(readFileSync(abs), {
      headers: { "content-type": MIME[extname(abs).toLowerCase()] ?? "application/octet-stream" },
    });
  });

  // Open a Playwright trace in the trace viewer (local machine).
  app.post("/api/trace", async (c) => {
    const body = await c.req.json<{ path: string }>();
    const abs = join(paths.root, body.path);
    if (!existsSync(abs)) return c.json({ error: "trace not found" }, 404);
    if (extname(abs).toLowerCase() !== ".zip") {
      return c.json({ error: "not a Playwright trace — open it via /api/artifact instead" }, 400);
    }
    const cli = resolvePlaywrightCli(paths.root);
    spawn(cli.command, [...cli.prefix, "show-trace", abs], {
      cwd: paths.root,
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    }).unref();
    return c.json({ ok: true });
  });

  // ---- static SPA --------------------------------------------------------
  if (opts.serveUi) {
    const uiDir = join(dirname(fileURLToPath(import.meta.url)), "ui");
    const serveFile = (relPath: string): Response | null => {
      const file = join(uiDir, relPath);
      if (!existsSync(file) || !file.startsWith(uiDir)) return null;
      const body = readFileSync(file);
      return new Response(body, {
        headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" },
      });
    };
    app.get("/*", (c) => {
      const path = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
      const asset = path && serveFile(path);
      if (asset) return asset;
      const index = serveFile("index.html"); // SPA fallback
      return index ?? c.text("UI not built. Run `npm run build:ui`.", 500);
    });
  }

  return app;
}

export function startServer(opts: ServerOptions): Promise<{ url: string }> {
  const app = createApp(opts);
  return new Promise((resolve) => {
    serve({ fetch: app.fetch, port: opts.port }, (info) => {
      resolve({ url: `http://localhost:${info.port}` });
    });
  });
}
