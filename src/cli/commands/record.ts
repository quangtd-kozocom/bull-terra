import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { authRequirementError, authStateInfo, featureStartUrl } from "../../core/auth.js";
import { featureRecordingPath, projectRecordingsDir, safePathSegment } from "../../core/paths.js";
import { chromiumInstalled, resolvePlaywrightCli } from "../../core/playwright.js";
import { c, CliError, openDb, resolvePaths, resolveEnvironment, resolveProject } from "../util.js";

export interface RecordFlags {
  project?: string;
  env?: string;
  feature?: string;
  name?: string;
  url?: string;
}

/**
 * Record a base navigation flow with `playwright codegen` (PRD §7.3).
 * The resulting file is the *selector source* the /gen-tests skill reuses,
 * so generated specs get real selectors without a per-run live-DOM MCP.
 *
 * Recordings are shared across environments (selectors, not URLs/creds), so we
 * open codegen against whatever env you point it at (default env otherwise).
 */
export function recordCommand(flags: RecordFlags): Promise<void> {
  const paths = resolvePaths();
  const db = openDb(paths);
  const project = resolveProject(db, flags.project);
  const env = resolveEnvironment(db, project, flags.env);
  const name = flags.name ?? "base";
  const feature = flags.feature ? db.getFeature(project.id, flags.feature) : undefined;
  if (flags.feature && !feature) {
    db.close();
    throw new CliError(
      `Project "${project.name}" has no feature "${flags.feature}". Add it with: bull-terra feature add ${project.name} ${flags.feature} --sheet <sheetId>`,
    );
  }
  const authError = feature ? authRequirementError(paths, project, env, feature) : null;
  if (authError) {
    db.close();
    throw new CliError(authError);
  }
  const url = flags.url ?? (feature ? featureStartUrl(env, feature) : env.url);
  const auth = authStateInfo(paths, project, env);
  const dir = feature
    ? join(projectRecordingsDir(paths, project.name), safePathSegment(feature.name))
    : projectRecordingsDir(paths, project.name);
  mkdirSync(dir, { recursive: true });
  const outPath = feature
    ? featureRecordingPath(paths, project.name, feature.name, name)
    : join(dir, `${safePathSegment(name)}.ts`);

  // Preflight: codegen can't open a browser that isn't installed.
  if (!chromiumInstalled()) {
    console.log(
      c.yellow("\n! Chromium isn't installed for Playwright. ") +
        c.dim("Run: ") +
        c.bold("bull-terra install-browsers") +
        "\n",
    );
    db.close();
    return Promise.resolve();
  }

  const cli = resolvePlaywrightCli(paths.root);
  const label = feature ? `${project.name}/${feature.name}/${name}` : `${project.name}/${name}`;
  console.log(
    `${c.bold("bull-terra")} recording ${c.cyan(`${label} @ ${env.name}`)} → ${c.dim(outPath)}\n` +
      c.dim("  A browser will open. Click through login + the flow, then close it to save.\n"),
  );

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      cli.command,
      [
        ...cli.prefix,
        "codegen",
        url,
        ...(auth.exists ? ["--load-storage", auth.path] : []),
        "--output",
        outPath,
        "--target",
        "playwright-test",
      ],
      { cwd: paths.root, stdio: "inherit", shell: process.platform === "win32" },
    );
    child.on("error", reject);
    child.on("close", () => {
      if (existsSync(outPath)) {
        const rec = feature
          ? db.addFeatureRecording(project.id, feature.id, name, outPath)
          : db.addRecording(project.id, name, outPath);
        console.log(`\n${c.green("✓")} Saved & registered recording ${c.bold(rec.name)}.`);
        console.log(
          c.dim(`  Generate tests that reuse it: claude "/gen-tests ${project.name} ${feature?.name ?? "<feature>"}"`),
        );
      } else {
        console.log(c.yellow("\nNo recording file was produced (codegen closed without saving)."));
      }
      db.close();
      resolve();
    });
  });
}
