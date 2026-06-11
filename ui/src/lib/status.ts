// Maps a test/run status to its instrument colour + glyph. Colours are theme
// CSS variables (set in style.css) so they adapt to light/dark automatically.
export interface StatusLook {
  color: string; // a CSS var() reference
  glyph: string;
  label: string;
}

export function look(status: string): StatusLook {
  switch (status) {
    case "passed":
      return { color: "var(--color-pass)", glyph: "●", label: "passed" };
    case "failed":
    case "timedOut":
    case "interrupted":
      return { color: "var(--color-fail)", glyph: "▲", label: status === "failed" ? "failed" : status };
    case "running":
      return { color: "var(--color-accent)", glyph: "◐", label: "running" };
    case "queued":
      return { color: "var(--color-ink-3)", glyph: "○", label: "queued" };
    case "skipped":
      return { color: "var(--color-ink-3)", glyph: "–", label: "skipped" };
    case "error":
      return { color: "var(--color-fail)", glyph: "✕", label: "error" };
    case "stopped":
      return { color: "var(--color-ink-3)", glyph: "■", label: "stopped" };
    case "never-run":
      return { color: "var(--color-ink-3)", glyph: "○", label: "not run" };
    default:
      return { color: "var(--color-ink-3)", glyph: "○", label: status };
  }
}

/** A test that was green in the baseline but is now red = regression. */
export function isRegression(t: { status: string; baseline: string | null }): boolean {
  return t.baseline === "passed" && (t.status === "failed" || t.status === "timedOut");
}

/** Health colour for a pass/total ratio (theme-aware CSS vars). */
export function healthColor(passed: number, total: number, failed: number): string {
  if (failed > 0) return "var(--color-fail)";
  if (total > 0 && passed === total) return "var(--color-pass)";
  return "var(--color-flaky)";
}
