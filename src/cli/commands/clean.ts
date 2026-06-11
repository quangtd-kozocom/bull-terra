import { cleanProjectArtifacts, projectArtifactStats } from "../../core/artifacts.js";
import { c, openDb, resolveProject, resolvePaths } from "../util.js";

export interface CleanFlags {
  project?: string;
  keep?: string;
  dryRun?: boolean;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Reclaim disk space from run artifacts (screenshots, videos, traces).
 * Keeps the newest --keep runs (default 10); run rows and results stay in the
 * DB so history still reads correctly — only the files and links go away.
 */
export async function cleanCommand(flags: CleanFlags): Promise<void> {
  const paths = resolvePaths();
  const db = openDb(paths);
  try {
    const project = resolveProject(db, flags.project);
    const keep = Math.max(0, Number(flags.keep ?? "10") || 0);
    const stats = projectArtifactStats(db, paths, project);

    console.log(
      `${c.bold("bull-terra")} artifacts for ${c.cyan(project.name)}: ` +
        `${fmtBytes(stats.totalBytes)} across ${Object.keys(stats.byRun).length} runs`,
    );

    if (flags.dryRun) {
      const victims = Object.keys(stats.byRun)
        .map(Number)
        .sort((a, b) => b - a)
        .slice(keep);
      const bytes = victims.reduce((sum, id) => sum + stats.byRun[id], 0);
      console.log(c.dim(`  Would delete ${victims.length} runs' artifacts (${fmtBytes(bytes)}), keeping the newest ${keep}.`));
      return;
    }

    const { freedBytes, deletedRuns } = cleanProjectArtifacts(db, paths, project, keep);
    console.log(
      `  ${c.green("✓")} Freed ${c.bold(fmtBytes(freedBytes))} from ${deletedRuns} runs ` +
        c.dim(`(kept the newest ${keep}).`),
    );
  } finally {
    db.close();
  }
}
