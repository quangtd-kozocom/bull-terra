// Time/duration formatting for run history. SQLite's datetime('now') emits
// "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker — normalize before parsing
// so timestamps don't shift by the viewer's UTC offset.

export function parseDbDate(value: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
}

/** "just now" / "8m ago" / "3h ago" / "2d ago", falling back to a local date. */
export function relativeTime(value: string, now = Date.now()): string {
  const then = parseDbDate(value).getTime();
  if (Number.isNaN(then)) return value;
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return parseDbDate(value).toLocaleDateString();
}

/** "312 KB" / "4.2 MB" for an artifact size on disk. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** "0.4s" / "12.3s" / "2m 05s" for a millisecond duration. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "–";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}
