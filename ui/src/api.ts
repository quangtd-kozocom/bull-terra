import type { ProjectView, RunEvent } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch("/api/projects").then((r) => json<ProjectView[]>(r)),

  getProject: (name: string) =>
    fetch(`/api/projects/${encodeURIComponent(name)}`).then((r) => json<ProjectView>(r)),

  addProject: (body: { name: string; url: string; sheetId?: string }) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<ProjectView>(r)),

  removeProject: (name: string) =>
    fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" }).then((r) => json(r)),

  genCommand: (name: string, feature?: string) =>
    fetch(
      `/api/projects/${encodeURIComponent(name)}/gen-command?feature=${encodeURIComponent(feature ?? "")}`,
    ).then((r) => json<{ command: string }>(r)),

  record: (name: string, body: { name?: string; url?: string }) =>
    fetch(`/api/projects/${encodeURIComponent(name)}/record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json(r)),

  showTrace: (path: string) =>
    fetch("/api/trace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }).then((r) => json(r)),

  stopRun: () => fetch("/api/run/stop", { method: "POST" }).then((r) => json(r)),
};

/**
 * Open the SSE run stream. Returns a disposer that closes the connection
 * (which the server treats as an abort — wired to the Stop button).
 */
export function streamRun(
  name: string,
  feature: string | undefined,
  onEvent: (e: RunEvent) => void,
): () => void {
  const qs = feature ? `?feature=${encodeURIComponent(feature)}` : "";
  const es = new EventSource(`/api/projects/${encodeURIComponent(name)}/run${qs}`);
  const handle = (ev: MessageEvent) => {
    try {
      onEvent(JSON.parse(ev.data) as RunEvent);
    } catch {
      /* ignore malformed frame */
    }
  };
  for (const t of [
    "run-start",
    "test-begin",
    "test-end",
    "stdout",
    "stderr",
    "run-end",
  ] as const) {
    es.addEventListener(t, handle as EventListener);
  }
  es.addEventListener("run-end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}
