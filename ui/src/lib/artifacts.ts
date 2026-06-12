// The runner stores at most one trace zip per result (when tracing is on).
// Branch the UI on which artifact kind a path is.

export type ArtifactKind = "video" | "trace" | "other";

export function artifactKind(path: string): ArtifactKind {
  if (/\.webm$/i.test(path)) return "video";
  if (/\.zip$/i.test(path)) return "trace";
  return "other";
}

/** URL serving the artifact bytes from the local server. */
export function artifactUrl(path: string): string {
  return `/api/artifact?path=${encodeURIComponent(path)}`;
}

/** Label for the open-artifact affordance, by kind. */
export function artifactLabel(path: string): string {
  const kind = artifactKind(path);
  if (kind === "trace") return "trace ↗";
  if (kind === "video") return "video ↗";
  return "artifact ↗";
}
