import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Db } from "../../core/db.js";
import { c, resolvePaths, templatesDir } from "../util.js";

export interface InitFlags {
  upgrade?: boolean;
  browser?: boolean; // commander --no-browser => browser:false
}

function copyFile(src: string, dest: string, { overwrite }: { overwrite: boolean }): boolean {
  if (!existsSync(src)) return false;
  if (existsSync(dest) && !overwrite) return false;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  return true;
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

/** Append missing lines to (or create) the project's .gitignore. */
function ensureGitignore(root: string): void {
  const file = join(root, ".gitignore");
  const needed = [
    "# bull-terra",
    "data.db",
    "data.db-*",
    ".env",
    "auth.json",
    "recordings/",
    "test-results/",
    "playwright-report/",
    ".bull-terra/",
  ];
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const missing = needed.filter((line) => !existing.split(/\r?\n/).includes(line));
  if (missing.length === 0) return;
  writeFileSync(file, `${existing.trimEnd()}\n${missing.join("\n")}\n`);
}

/**
 * `bull-terra init` (PRD §10): install Chromium, drop the /gen-tests skill,
 * create data.db, write .env.example + config templates, print setup pointers.
 * `--upgrade` refreshes ONLY the skill template, leaving data.db and .env intact.
 */
export function initCommand(flags: InitFlags): void {
  const paths = resolvePaths();
  const tpl = templatesDir();
  const ok = (s: string) => console.log(`  ${c.green("✓")} ${s}`);
  const skip = (s: string) => console.log(`  ${c.dim("•")} ${c.dim(s)}`);

  // The generation contract — always refreshed (this is what --upgrade targets).
  const skillSrc = join(tpl, "gen-tests");
  const skillDest = join(paths.skillsDir, "gen-tests");
  copyDir(skillSrc, skillDest);
  ok(`gen-tests skill ${flags.upgrade ? "refreshed" : "installed"} → ${skillDest}`);

  if (flags.upgrade) {
    console.log(c.green(c.bold("\nUpgrade complete.")) + c.dim(" data.db and .env left untouched.\n"));
    return;
  }

  // Database
  if (existsSync(paths.dbPath)) skip("data.db already exists");
  else {
    new Db(paths.dbPath).close();
    ok("created data.db");
  }

  // Config + scaffolding templates (never overwrite developer edits).
  const files: Array<[string, string]> = [
    [join(tpl, "playwright.config.ts"), paths.playwrightConfig],
    [join(tpl, "global-setup.ts"), join(paths.root, "tests", "global-setup.ts")],
    [join(tpl, ".env.example"), paths.envExamplePath],
    [join(tpl, "github-workflow.yml"), join(paths.root, ".github", "workflows", "bull-terra.yml")],
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
    const r = spawnSync("npx", ["playwright", "install", "chromium"], {
      cwd: paths.root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status === 0) ok("Chromium installed");
    else console.log(c.yellow("  ! Chromium install failed — run `npx playwright install chromium` manually."));
  }

  printNextSteps();
}

function printNextSteps(): void {
  console.log(`
${c.bold("Next steps")}
  1. ${c.cyan("Register a project")}      bull-terra project add <name> <url> --sheet <sheetId>
  2. ${c.cyan("Record a base flow")}      bull-terra record --project <name>
  3. ${c.cyan("Set up Google Sheets MCP")} the /gen-tests skill reads test cases via the
     ${c.dim("kozocom-mcp / terra-mcp Google MCP. Authenticate it in Claude Code (OAuth);")}
     ${c.dim("bull-terra cannot provision your Google account for you.")}
  4. ${c.cyan("Add credentials")}         copy .env.example → .env and fill APP_<X>_USER / APP_<X>_PASS
  5. ${c.cyan("Generate tests")}          claude "/gen-tests <name> <feature>"
  6. ${c.cyan("Open the dashboard")}      bull-terra serve
`);
}
