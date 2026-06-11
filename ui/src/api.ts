import type { NewEnvironment, ProjectView, RunEvent } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const enc = encodeURIComponent;

export const api = {
  listProjects: () => fetch("/api/projects").then((r) => json<ProjectView[]>(r)),

  getProject: (name: string, env?: string) =>
    fetch(`/api/projects/${enc(name)}${env ? `?env=${enc(env)}` : ""}`).then((r) =>
      json<ProjectView>(r),
    ),

  addProject: (name: string) => post("/api/projects", { name }).then((r) => json<ProjectView>(r)),

  removeProject: (name: string) =>
    fetch(`/api/projects/${enc(name)}`, { method: "DELETE" }).then((r) => json(r)),

  // environments
  addEnvironment: (name: string, env: NewEnvironment) =>
    post(`/api/projects/${enc(name)}/environments`, env).then((r) => json<ProjectView>(r)),

  setDefaultEnvironment: (name: string, env: string) =>
    fetch(`/api/projects/${enc(name)}/environments/${enc(env)}/default`, { method: "PUT" }).then(
      (r) => json<ProjectView>(r),
    ),

  removeEnvironment: (name: string, env: string) =>
    fetch(`/api/projects/${enc(name)}/environments/${enc(env)}`, { method: "DELETE" }).then((r) =>
      json<ProjectView>(r),
    ),

  // features
  addFeature: (name: string, feature: { name: string; sheetId?: string }) =>
    post(`/api/projects/${enc(name)}/features`, feature).then((r) => json<ProjectView>(r)),

  removeFeature: (name: string, feature: string) =>
    fetch(`/api/projects/${enc(name)}/features/${enc(feature)}`, { method: "DELETE" }).then((r) =>
      json<ProjectView>(r),
    ),

  genCommand: (name: string, feature?: string) =>
    fetch(`/api/projects/${enc(name)}/gen-command?feature=${enc(feature ?? "")}`).then((r) =>
      json<{ command: string }>(r),
    ),

  record: (name: string, body: { name?: string; url?: string; env?: string }) =>
    post(`/api/projects/${enc(name)}/record`, body).then((r) => json(r)),

  showTrace: (path: string) => post("/api/trace", { path }).then((r) => json(r)),

  stopRun: () => fetch("/api/run/stop", { method: "POST" }).then((r) => json(r)),
};

/**
 * Open the SSE run stream against an environment. Returns a disposer that
 * closes the connection (which the server treats as an abort — Stop button).
 */
export function streamRun(
  name: string,
  feature: string | undefined,
  env: string | undefined,
  onEvent: (e: RunEvent) => void,
): () => void {
  const qs = new URLSearchParams();
  if (feature) qs.set("feature", feature);
  if (env) qs.set("env", env);
  const suffix = qs.toString() ? `?${qs}` : "";
  const es = new EventSource(`/api/projects/${enc(name)}/run${suffix}`);
  const handle = (ev: MessageEvent) => {
    try {
      onEvent(JSON.parse(ev.data) as RunEvent);
    } catch {
      /* ignore malformed frame */
    }
  };
  for (const t of ["run-start", "test-begin", "test-end", "stdout", "stderr", "run-end"] as const) {
    es.addEventListener(t, handle as EventListener);
  }
  es.addEventListener("run-end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}
