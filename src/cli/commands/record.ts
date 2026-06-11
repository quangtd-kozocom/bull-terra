import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectRecordingsDir } from "../../core/paths.js";
import { c, openDb, resolvePaths, resolveProject } from "../util.js";

export interface RecordFlags {
  project?: string;
  name?: string;
  url?: string;
}

/**
 * Record a base navigation flow with `playwright codegen` (PRD §7.3).
 * The resulting file is the *selector source* the /gen-tests skill reuses,
 * so generated specs get real selectors without a per-run live-DOM MCP.
 */
export function recordCommand(flags: RecordFlags): Promise<void> {
  const paths = resolvePaths();
  const db = openDb(paths);
  const project = resolveProject(db, flags.project);
  const url = flags.url ?? project.url;
  const name = flags.name ?? "base";
  const dir = projectRecordingsDir(paths, project.name);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${name}.ts`);

  console.log(
    `${c.bold("bull-terra")} recording ${c.cyan(project.name)} → ${c.dim(outPath)}\n` +
      c.dim("  A browser will open. Click through login + the flow, then close it to save.\n"),
  );

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["playwright", "codegen", url, "--output", outPath, "--target", "playwright-test"],
      { cwd: paths.root, stdio: "inherit", shell: process.platform === "win32" },
    );
    child.on("error", reject);
    child.on("close", () => {
      if (existsSync(outPath)) {
        const rec = db.addRecording(project.id, name, outPath);
        console.log(`\n${c.green("✓")} Saved & registered recording ${c.bold(rec.name)}.`);
        console.log(
          c.dim(`  Generate tests that reuse it: claude "/gen-tests ${project.name} <feature>"`),
        );
      } else {
        console.log(c.yellow("\nNo recording file was produced (codegen closed without saving)."));
      }
      db.close();
      resolve();
    });
  });
}
