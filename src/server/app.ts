import { serve } from "@hono/node-server";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Db } from "../core/db.js";
import { discoverFeatures } from "../core/discover.js";
import { projectRecordingsDir, projectSpecsDir, type ProjectPaths } from "../core/paths.js";
import { chromiumInstalled, resolvePlaywrightCli } from "../core/playwright.js";
import type { RunEvent } from "../core/types.js";
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
  ".ico": "image/x-icon",
};

export function createApp(opts: ServerOptions): Hono {
  const { paths } = opts;
  const db = new Db(paths.dbPath);
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

  // ---- environments ------------------------------------------------------
  app.post("/api/projects/:name/environments", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const body = await c.req
      .json<{ name: string; url: string; userVar?: string; passVar?: string; isDefault?: boolean }>()
      .catch(() => null);
    if (!body?.name || !body?.url) return c.json({ error: "name and url are required" }, 400);
    db.upsertEnvironment(p.id, body.name, body.url, {
      userVar: body.userVar ?? null,
      passVar: body.passVar ?? null,
      isDefault: body.isDefault,
    });
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

  // ---- features ----------------------------------------------------------
  app.post("/api/projects/:name/features", async (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{ name: string; sheetId?: string }>().catch(() => null);
    if (!body?.name) return c.json({ error: "name is required" }, 400);
    db.upsertFeature(p.id, body.name, body.sheetId ?? null);
    return c.json(buildProjectView(db, paths, p));
  });

  app.delete("/api/projects/:name/features/:feature", (c) => {
    const p = getProjectOr404(c.req.param("name"));
    if (!p) return c.json({ error: "not found" }, 404);
    db.deleteFeature(p.id, c.req.param("feature"));
    return c.json(buildProjectView(db, paths, p));
  });

  app.get("/api/projects/:name/runs/:runId", (c) => {
    const runId = Number(c.req.param("runId"));
    return c.json(db.listResults(runId));
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

    return streamSSE(c, async (stream) => {
      const send = (e: RunEvent) =>
        stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => {});
      // Allow the client to abort by closing the connection.
      stream.onAbort(() => {
        runs.stop();
      });
      await runs.run(db, paths, p, env, features.length ? features : undefined, send);
    });
  });

  app.post("/api/run/stop", (c) => c.json({ stopped: runs.stop() }));

  // ---- record (codegen, server-side; local tool) -------------------------
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
    const dir = projectRecordingsDir(paths, p.name);
    mkdirSync(dir, { recursive: true });
    const outPath = join(dir, `${recName}.ts`);
    const cli = resolvePlaywrightCli(paths.root);

    const result = await new Promise<{ ok: boolean; err: string }>((resolve) => {
      let stderr = "";
      const child = spawn(
        cli.command,
        [...cli.prefix, "codegen", url, "--output", outPath, "--target", "playwright-test"],
        { cwd: paths.root, shell: process.platform === "win32" },
      );
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", (e) => resolve({ ok: false, err: e.message }));
      child.on("close", () => resolve({ ok: existsSync(outPath), err: stderr.trim() }));
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

  // Open a Playwright trace in the trace viewer (local machine).
  app.post("/api/trace", async (c) => {
    const body = await c.req.json<{ path: string }>();
    const abs = join(paths.root, body.path);
    if (!existsSync(abs)) return c.json({ error: "trace not found" }, 404);
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
