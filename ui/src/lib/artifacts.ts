// The runner stores ONE artifact path per result: a trace zip when tracing is
// on, otherwise Playwright's failure screenshot. Branch the UI on which it is.

export type ArtifactKind = "image" | "video" | "trace" | "other";

export function artifactKind(path: string): ArtifactKind {
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) return "image";
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
  if (kind === "image") return "screenshot ↗";
  if (kind === "video") return "video ↗";
  return "artifact ↗";
}
