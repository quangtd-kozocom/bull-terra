import type {
  ArtifactStatsView,
  AuthStateView,
  EnvironmentInput,
  FeatureInput,
  NewEnvironment,
  ProjectView,
  RecordingSourceView,
  RunDetailView,
  RunEvent,
  RunSummaryView,
  ScreencastView,
} from "./types";

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

  updateProject: (name: string, next: { name: string }) =>
    fetch(`/api/projects/${enc(name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).then((r) => json<ProjectView>(r)),

  removeProject: (name: string) =>
    fetch(`/api/projects/${enc(name)}`, { method: "DELETE" }).then((r) => json(r)),

  // environments
  addEnvironment: (name: string, env: NewEnvironment) =>
    post(`/api/projects/${enc(name)}/environments`, env).then((r) => json<ProjectView>(r)),

  updateEnvironment: (name: string, env: string, next: EnvironmentInput) =>
    fetch(`/api/projects/${enc(name)}/environments/${enc(env)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).then((r) => json<ProjectView>(r)),

  setDefaultEnvironment: (name: string, env: string) =>
    fetch(`/api/projects/${enc(name)}/environments/${enc(env)}/default`, { method: "PUT" }).then(
      (r) => json<ProjectView>(r),
    ),

  removeEnvironment: (name: string, env: string) =>
    fetch(`/api/projects/${enc(name)}/environments/${enc(env)}`, { method: "DELETE" }).then((r) =>
      json<ProjectView>(r),
    ),

  captureAuth: (name: string, env: string) =>
    post(`/api/projects/${enc(name)}/environments/${enc(env)}/auth/capture`, {}).then((r) =>
      json<{ ok: true; path: string }>(r),
    ),

  getAuthState: (name: string, env: string) =>
    fetch(`/api/projects/${enc(name)}/environments/${enc(env)}/auth/state`).then((r) =>
      json<AuthStateView>(r),
    ),

  // features
  addFeature: (name: string, feature: FeatureInput) =>
    post(`/api/projects/${enc(name)}/features`, feature).then((r) => json<ProjectView>(r)),

  updateFeature: (name: string, feature: string, next: FeatureInput) =>
    fetch(`/api/projects/${enc(name)}/features/${enc(feature)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).then((r) => json<ProjectView>(r)),

  removeFeature: (name: string, feature: string) =>
    fetch(`/api/projects/${enc(name)}/features/${enc(feature)}`, { method: "DELETE" }).then((r) =>
      json<ProjectView>(r),
    ),

  removeTest: (name: string, feature: string, title: string, env?: string) =>
    fetch(
      `/api/projects/${enc(name)}/features/${enc(feature)}/tests?title=${enc(title)}${env ? `&env=${enc(env)}` : ""}`,
      { method: "DELETE" },
    ).then((r) => json<ProjectView>(r)),

  genCommand: (name: string, feature?: string) =>
    fetch(`/api/projects/${enc(name)}/gen-command?feature=${enc(feature ?? "")}`).then((r) =>
      json<{ command: string }>(r),
    ),

  record: (name: string, body: { name?: string; url?: string; env?: string }) =>
    post(`/api/projects/${enc(name)}/record`, body).then((r) => json(r)),

  recordFeature: (
    name: string,
    feature: string,
    body: { name?: string; url?: string; env?: string },
  ) =>
    post(`/api/projects/${enc(name)}/features/${enc(feature)}/recordings`, body).then((r) =>
      json(r),
    ),

  removeRecording: (name: string, recordingId: number, env?: string) =>
    fetch(
      `/api/projects/${enc(name)}/recordings/${recordingId}${env ? `?env=${enc(env)}` : ""}`,
      { method: "DELETE" },
    ).then((r) => json<ProjectView>(r)),

  getRecording: (name: string, recordingId: number) =>
    fetch(`/api/projects/${enc(name)}/recordings/${recordingId}`).then((r) =>
      json<RecordingSourceView>(r),
    ),

  saveRecording: (name: string, recordingId: number, source: string) =>
    fetch(`/api/projects/${enc(name)}/recordings/${recordingId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    }).then((r) => json<RecordingSourceView>(r)),

  promoteRecording: (name: string, recordingId: number, body: { tcId: string; title: string }) =>
    post(`/api/projects/${enc(name)}/recordings/${recordingId}/promote`, body).then((r) =>
      json<{ ok: true; feature: string; specPath: string; tcId: string; title: string }>(r),
    ),

  // run history
  listRuns: (name: string, env?: string, limit = 30) =>
    fetch(
      `/api/projects/${enc(name)}/runs?limit=${limit}${env ? `&env=${enc(env)}` : ""}`,
    ).then((r) => json<RunSummaryView[]>(r)),

  getRun: (name: string, runId: number) =>
    fetch(`/api/projects/${enc(name)}/runs/${runId}`).then((r) => json<RunDetailView>(r)),

  /** Erase runs from history (results + artifacts + the runs). No ids → the whole env's history. */
  deleteRuns: (name: string, ids?: number[], env?: string) => {
    const qs = new URLSearchParams();
    if (ids?.length) qs.set("ids", ids.join(","));
    else if (env) qs.set("env", env);
    const suffix = qs.toString() ? `?${qs}` : "";
    return fetch(`/api/projects/${enc(name)}/runs${suffix}`, { method: "DELETE" }).then((r) =>
      json<{ freedBytes: number; deletedRuns: number }>(r),
    );
  },

  // recorded test videos (screencasts)
  listScreencasts: (name: string, env?: string, limit = 100) =>
    fetch(
      `/api/projects/${enc(name)}/screencasts?limit=${limit}${env ? `&env=${enc(env)}` : ""}`,
    ).then((r) => json<ScreencastView[]>(r)),

  // run artifacts (screenshots / videos / traces on disk)
  artifactStats: (name: string) =>
    fetch(`/api/projects/${enc(name)}/artifacts`).then((r) => json<ArtifactStatsView>(r)),

  deleteRunArtifacts: (name: string, runId: number) =>
    fetch(`/api/projects/${enc(name)}/runs/${runId}/artifacts`, { method: "DELETE" }).then((r) =>
      json<{ freedBytes: number }>(r),
    ),

  cleanArtifacts: (name: string, keep = 0) =>
    fetch(`/api/projects/${enc(name)}/artifacts?keep=${keep}`, { method: "DELETE" }).then((r) =>
      json<{ freedBytes: number; deletedRuns: number }>(r),
    ),

  showTrace: (path: string) => post("/api/trace", { path }).then((r) => json(r)),

  openFile: (path: string) => post("/api/open", { path }).then((r) => json(r)),

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
  video: boolean,
  onEvent: (e: RunEvent) => void,
): () => void {
  const qs = new URLSearchParams();
  if (feature) qs.set("feature", feature);
  if (env) qs.set("env", env);
  if (video) qs.set("video", "1");
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
