import { executeRun } from "../../core/engine.js";
import { discoverFeatures } from "../../core/discover.js";
import { projectSpecsDir } from "../../core/paths.js";
import { buildWriteback, writeWritebackFile } from "../../core/writeback.js";
import { c, CliError, openDb, printVerdict, resolvePaths, resolveProject } from "../util.js";

export interface RunFlags {
  all?: boolean;
  project?: string;
  feature?: string;
  writeback?: boolean;
}

/**
 * The regression gate (PRD §7.2). Same engine as the dashboard.
 * Exits 1 ONLY when a previously-passing test now fails.
 */
export async function runCommand(flags: RunFlags): Promise<void> {
  const paths = resolvePaths();
  const db = openDb(paths);
  try {
    const project = resolveProject(db, flags.project);
    const specsDir = projectSpecsDir(paths, project.name);

    let features: string[] | undefined;
    if (flags.feature) features = [flags.feature];
    else if (!flags.all) {
      // Default to all discovered features for the project.
      features = discoverFeatures(specsDir);
      if (features.length === 0)
        throw new CliError(
          `No generated specs found under ${specsDir}. Generate some with: claude "/gen-tests ${project.name} <feature>"`,
        );
    }

    console.log(
      `${c.bold("bull-terra")} running ${c.cyan(project.name)} ` +
        `${c.dim(features ? features.join(", ") : "(all features)")}`,
    );

    const { run, results, verdict } = await executeRun({
      db,
      project,
      projectRoot: paths.root,
      specsDir,
      features,
      onEvent: (e) => {
        if (e.type === "test-end")
          process.stdout.write(e.status === "passed" ? c.green("·") : c.red("·"));
      },
    });
    process.stdout.write("\n");

    printVerdict(verdict);

    if (flags.writeback) {
      const payload = buildWriteback(project, results, new Date().toISOString());
      const file = writeWritebackFile(paths.root, run.id, payload);
      console.log(
        c.dim(`  Wrote sheet write-back payload (${payload.rows.length} rows) → ${file}`),
      );
      console.log(c.dim(`  Apply it with: claude "/sheet-writeback ${project.name}"`));
    }

    if (verdict.exitCode === 1) {
      console.log(c.red(c.bold("  ✘ Regression gate failed — a previously-passing test broke.")));
      process.exitCode = 1;
    } else {
      console.log(c.green(c.bold("  ✓ Regression gate passed — nothing that worked is broken.")));
    }
  } finally {
    db.close();
  }
}
