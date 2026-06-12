import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Db } from "../../core/db.js";
import { resolvePlaywrightCli } from "../../core/playwright.js";
import { c, resolvePaths, templatesDir } from "../util.js";

export interface InitFlags {
  browser?: boolean; // commander --no-browser => browser:false
}

function copyFile(src: string, dest: string, { overwrite }: { overwrite: boolean }): boolean {
  if (!existsSync(src)) return false;
  if (existsSync(dest) && !overwrite) return false;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  return true;
}

/** Append missing lines to (or create) the project's .gitignore. */
function ensureGitignore(root: string): void {
  const file = join(root, ".gitignore");
  const needed = [
    "# bull-terra",
    "data.db",
    "data.db-*",
    ".env",
    "auth/",
    "auth.json",
    "recordings/",
    "test-results/",
    "playwright-report/",
  ];
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const missing = needed.filter((line) => !existing.split(/\r?\n/).includes(line));
  if (missing.length === 0) return;
  writeFileSync(file, `${existing.trimEnd()}\n${missing.join("\n")}\n`);
}

/**
 * `bull-terra init` (PRD §10): install Chromium, create ~/.bull-terra/data.db,
 * write .env.example + config templates, print setup pointers. The /gen-tests
 * skill is published separately and installed into .claude/skills (see README).
 */
export function initCommand(flags: InitFlags): void {
  const paths = resolvePaths();
  const tpl = templatesDir();
  const ok = (s: string) => console.log(`  ${c.green("✓")} ${s}`);
  const skip = (s: string) => console.log(`  ${c.dim("•")} ${c.dim(s)}`);

  // Database
  if (existsSync(paths.dbPath)) skip(`${paths.dbPath} already exists`);
  else {
    new Db(paths.dbPath).close();
    ok(`created ${paths.dbPath}`);
  }

  // Config + scaffolding templates (never overwrite developer edits).
  const files: Array<[string, string]> = [
    [join(tpl, "playwright.config.ts"), paths.playwrightConfig],
    [join(tpl, "global-setup.ts"), join(paths.root, "tests", "global-setup.ts")],
    [join(tpl, ".env.example"), paths.envExamplePath],
  ];
  for (const [src, dest] of files) {
    if (copyFile(src, dest, { overwrite: false })) ok(`wrote ${dest.replace(paths.root + "/", "")}`);
    else skip(`${dest.replace(paths.root + "/", "")} exists`);
  }

  // tests/gen placeholder so the convention dir exists
  mkdirSync(paths.specsDir, { recursive: true });
  const keep = join(paths.specsDir, ".gitkeep");
  if (!existsSync(keep)) writeFileSync(keep, "");

  ensureGitignore(paths.root);
  ok(".gitignore updated");

  // Chromium (explicit, not a postinstall — PRD §10).
  if (flags.browser === false) {
    skip("skipped Chromium install (--no-browser)");
  } else {
    console.log(c.dim("\n  Installing Chromium for Playwright…"));
    const cli = resolvePlaywrightCli(paths.root);
    const r = spawnSync(cli.command, [...cli.prefix, "install", "chromium"], {
      cwd: paths.root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status === 0) ok("Chromium installed");
    else console.log(c.yellow("  ! Chromium install failed — run `bull-terra install-browsers` manually."));
  }

  printNextSteps();
}

function printNextSteps(): void {
  console.log(`
${c.bold("Next steps")}
  1. ${c.cyan("Install the /gen-tests skill")} npx skills add quangtd-kozocom/bull-terra
     ${c.dim("publishes the gen-tests skill from .claude/skills/gen-tests")}
  2. ${c.cyan("Register a project")}      bull-terra project add <name>
  3. ${c.cyan("Add environment(s)")}     bull-terra env add <name> stg <url> --default --user-var APP_STG_USER --pass-var APP_STG_PASS
  4. ${c.cyan("Add feature(s)")}         bull-terra feature add <name> <feature> --sheet <sheetId>
  5. ${c.cyan("Record a base flow")}     bull-terra record --project <name> --feature <feature> --env stg
  6. ${c.cyan("Set up Google Sheets MCP")} the /gen-tests skill reads test cases via the
     ${c.dim("kozocom-mcp / terra-mcp Google MCP. Authenticate it in Claude Code (OAuth);")}
     ${c.dim("bull-terra cannot provision your Google account for you.")}
  7. ${c.cyan("Add credentials")}         copy .env.example → .env and fill the per-env vars you named
  8. ${c.cyan("Generate tests")}          claude "/gen-tests <name> <feature>"
  9. ${c.cyan("Run the gate")}            bull-terra run --project <name> --env stg --all
 10. ${c.cyan("Open the dashboard")}      bull-terra serve
`);
}
