import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Db } from "../core/db.js";
import { findProjectRoot, projectPaths, type ProjectPaths } from "../core/paths.js";
import type { GateVerdict, Project } from "../core/types.js";

// ---- tiny ANSI helpers (no dependency) -----------------------------------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string | number) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
export const c = {
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
  dim: wrap("2"),
  bold: wrap("1"),
  cyan: wrap("36"),
};

export function resolvePaths(): ProjectPaths {
  return projectPaths(findProjectRoot());
}

export function openDb(paths: ProjectPaths): Db {
  return new Db(paths.dbPath);
}

/** Resolve a project by name, or the only project if there's exactly one. */
export function resolveProject(db: Db, name?: string): Project {
  if (name) {
    const p = db.getProjectByName(name);
    if (!p) {
      throw new CliError(
        `No project named "${name}". Add it with: bull-terra project add ${name} <url>`,
      );
    }
    return p;
  }
  const all = db.listProjects();
  if (all.length === 0)
    throw new CliError(`No projects registered. Add one with: bull-terra project add <name> <url>`);
  if (all.length > 1)
    throw new CliError(
      `Multiple projects exist (${all.map((p) => p.name).join(", ")}). Pass --project <name>.`,
    );
  return all[0];
}

/** Locates the package's bundled `templates/` dir in both dev (src) and built (dist) layouts. */
export function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "templates"), // dist/cli.js -> dist/../templates
    join(here, "..", "..", "templates"), // src/cli/index.ts -> ../../templates
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return join(here, "..", "templates");
}

export class CliError extends Error {}

export function printVerdict(verdict: GateVerdict): void {
  const { passed, regressions, newFailures, quarantined } = verdict;
  const total = passed.length + regressions.length + newFailures.length + quarantined.length;
  console.log("");
  console.log(
    `  ${c.bold("Results")} ${c.dim(`(${total} tests)`)}  ` +
      `${c.green(`${passed.length} passed`)}  ` +
      `${c.red(`${regressions.length} regressed`)}  ` +
      `${c.yellow(`${newFailures.length} new-fail`)}  ` +
      `${c.dim(`${quarantined.length} quarantined`)}`,
  );
  for (const r of regressions) {
    console.log(`  ${c.red("✘ REGRESSION")} ${r.title}`);
    if (r.error) console.log(c.dim(`      ${r.error.split("\n")[0]}`));
  }
  for (const r of newFailures) console.log(`  ${c.yellow("• new failure")} ${c.dim(r.title)}`);
  for (const r of quarantined) console.log(`  ${c.dim(`~ quarantined (flaky) ${r.title}`)}`);
  console.log("");
}
