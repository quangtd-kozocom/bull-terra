import type { RunSummary } from "../../core/types.js";
import { c, openDb, resolveEnvironment, resolveProject, resolvePaths } from "../util.js";

export interface HistoryFlags {
  project?: string;
  env?: string;
  limit?: string;
  json?: boolean;
}

function statusGlyph(status: RunSummary["status"]): string {
  switch (status) {
    case "passed":
      return c.green("✓ passed ");
    case "failed":
      return c.red("✘ failed ");
    case "error":
      return c.red("✕ error  ");
    case "stopped":
      return c.dim("■ stopped");
    default:
      return c.cyan("◐ running");
  }
}

/** "0.4s" / "2m 05s" — mirrors the dashboard's duration formatting. */
function fmtDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/**
 * Print the same run timeline the dashboard's History tab shows, for terminals
 * and CI logs. `--json` emits the raw summaries for scripting.
 */
export async function historyCommand(flags: HistoryFlags): Promise<void> {
  const paths = resolvePaths();
  const db = openDb(paths);
  try {
    const project = resolveProject(db, flags.project);
    const env = resolveEnvironment(db, project, flags.env);
    const limit = Math.min(Number(flags.limit) || 20, 200);
    const summaries = db.listRunSummaries(project.id, env.id, limit);

    if (flags.json) {
      console.log(JSON.stringify(summaries, null, 2));
      return;
    }

    console.log(
      `${c.bold("bull-terra")} history ${c.cyan(`${project.name}/${env.name}`)} ` +
        `${c.dim(`(last ${summaries.length} runs)`)}\n`,
    );
    if (summaries.length === 0) {
      console.log(c.dim("  No runs recorded yet. Start one with: bull-terra run"));
      return;
    }

    const idWidth = Math.max(...summaries.map((s) => String(s.id).length));
    const featureWidth = Math.max(...summaries.map((s) => (s.feature ?? "all").length));
    for (const s of summaries) {
      const tags = [
        s.regressions ? c.red(`${s.regressions} regression${s.regressions > 1 ? "s" : ""}`) : null,
        s.newFailures ? c.yellow(`${s.newFailures} new-fail`) : null,
        s.quarantined ? c.dim(`${s.quarantined} quarantined`) : null,
      ].filter(Boolean);
      console.log(
        `  #${String(s.id).padStart(idWidth)}  ${statusGlyph(s.status)}  ` +
          `${(s.feature ?? "all").padEnd(featureWidth)}  ` +
          `${c.dim(s.started_at)}  ` +
          `${c.green(`${s.passed} passed`)} ${s.failed ? c.red(`${s.failed} failed`) : c.dim("0 failed")} ` +
          `${c.dim(fmtDuration(s.duration_ms))}` +
          (tags.length ? `  ${tags.join(" ")}` : ""),
      );
    }
    console.log("");
  } finally {
    db.close();
  }
}
