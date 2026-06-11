// Maps a test/run status to its instrument colour + glyph.
export interface StatusLook {
  color: string; // hex
  glyph: string;
  label: string;
}

export function look(status: string): StatusLook {
  switch (status) {
    case "passed":
      return { color: "#74c365", glyph: "●", label: "passed" };
    case "failed":
    case "timedOut":
    case "interrupted":
      return { color: "#ef5b3c", glyph: "▲", label: status === "failed" ? "failed" : status };
    case "running":
      return { color: "#f2a900", glyph: "◐", label: "running" };
    case "queued":
      return { color: "#948872", glyph: "○", label: "queued" };
    case "skipped":
      return { color: "#948872", glyph: "–", label: "skipped" };
    case "never-run":
      return { color: "#5c5345", glyph: "○", label: "not run" };
    default:
      return { color: "#948872", glyph: "○", label: status };
  }
}

/** A test that was green in the baseline but is now red = regression. */
export function isRegression(t: { status: string; baseline: string | null }): boolean {
  return t.baseline === "passed" && (t.status === "failed" || t.status === "timedOut");
}
