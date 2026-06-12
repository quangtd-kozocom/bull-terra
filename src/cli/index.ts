import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import { join } from "node:path";
import { bullTerraHome } from "../core/paths.js";
import { c, CliError } from "./util.js";
import { initCommand } from "./commands/init.js";
import { serveCommand } from "./commands/serve.js";
import { runCommand } from "./commands/run.js";
import { recordCommand } from "./commands/record.js";
import { projectAdd, projectList, projectRemove } from "./commands/project.js";
import { envAdd, envDefault, envList, envRemove } from "./commands/env.js";
import { featureAdd, featureInspect, featureList, featureRemove } from "./commands/feature.js";
import { cleanCommand } from "./commands/clean.js";
import { historyCommand } from "./commands/history.js";
import { installBrowsersCommand } from "./commands/installBrowsers.js";
import { doctorCommand } from "./commands/doctor.js";

// Load bull-terra's state-home .env so login secrets reach Playwright (PRD §14).
loadEnv({ path: join(bullTerraHome(), ".env"), quiet: true });

const VERSION = "0.1.0";

const program = new Command();

program
  .name("bull-terra")
  .description(
    "Local UI-testing harness: Google Sheet test cases → Playwright specs, with a live\n" +
      "dashboard and a regression-aware CLI gate.",
  )
  .version(VERSION, "-v, --version");

program
  .command("init")
  .description("Install Chromium, create ~/.bull-terra/data.db + config templates")
  .option("--no-browser", "skip installing Chromium")
  .action((flags) => initCommand(flags));

program
  .command("serve")
  .description("Start the local web dashboard")
  .option("-p, --port <port>", "port to listen on", "4317")
  .option("--no-open", "do not open the browser automatically")
  .option("--dev", "API-only dev mode (run the UI via `npm run dev:ui`)")
  .action(async (flags) => serveCommand(flags));

program
  .command("run")
  .description("Run generated specs through the regression-aware gate (exit 1 only on regressions)")
  .option("--all", "run every feature across the project")
  .option("--project <name>", "project to run (defaults to the only registered project)")
  .option("--env <name>", "environment to run against (defaults to the project's default env)")
  .option("--feature <name>", "run a single feature (folder/file under tests/gen/<project>)")
  .option("--writeback", "emit a Google Sheet write-back payload for the MCP step")
  .option("--video", "record a video of every test (saved under recordings/<project>/.runs/)")
  .action(async (flags) => runCommand(flags));

program
  .command("record")
  .description("Record a base navigation flow with `playwright codegen` (the selector source)")
  .option("--project <name>", "project to record for")
  .option("--env <name>", "environment whose URL to open (defaults to the project's default env)")
  .option("--feature <name>", "feature to attach this recording to")
  .option("--name <name>", "recording name (default: base)")
  .option("--url <url>", "start URL (default: the chosen environment's url)")
  .action(async (flags) => recordCommand(flags));

program
  .command("history")
  .description("Show recent runs for an environment (the dashboard's History tab, in the terminal)")
  .option("--project <name>", "project to inspect (defaults to the only registered project)")
  .option("--env <name>", "environment (defaults to the project's default env)")
  .option("--limit <n>", "number of runs to show", "20")
  .option("--json", "emit raw JSON for scripting")
  .action(async (flags) => historyCommand(flags));

program
  .command("clean")
  .description("Delete run artifacts (videos/traces) to reclaim disk space")
  .option("--project <name>", "project to clean (defaults to the only registered project)")
  .option("--keep <n>", "keep the newest N runs' artifacts", "10")
  .option("--dry-run", "report what would be deleted without touching disk")
  .action(async (flags) => cleanCommand(flags));

program
  .command("install-browsers")
  .description("Install the Chromium build Playwright codegen/runs need")
  .option("--force", "reinstall even if Chromium appears installed")
  .action((flags) => installBrowsersCommand(flags));

program
  .command("doctor")
  .description("Check local bull-terra setup and print fixes for common run failures")
  .option("--project <name>", "project to check (defaults to the only registered project)")
  .option("--env <name>", "environment to check (defaults to the project's default env)")
  .action(async (flags) => doctorCommand(flags));

const project = program.command("project").description("Manage registered projects");
project
  .command("add <name>")
  .description("Register (or update) a project")
  .action((name) => projectAdd(name));
project.command("list").description("List registered projects + their environments").action(() => projectList());
project.command("rm <name>").description("Remove a project from the registry").action((name) => projectRemove(name));

const collect = (value: string, acc: string[]) => acc.concat(value);

const env = program.command("env").description("Manage a project's environments (local / dev / stg …)");
env
  .command("add <project> <name> <url>")
  .description("Add (or update) an environment for a project")
  .option("--default", "make this the project's default environment")
  .option("--var <key=name>", "name a secret .env var as KEY=ENV_VAR_NAME (repeatable)", collect, [])
  .option("--unset <key>", "remove a previously-registered secret var by KEY (repeatable)", collect, [])
  .option("--user-var <name>", "sugar for --var USER=<name>")
  .option("--pass-var <name>", "sugar for --var PASS=<name>")
  .action((projectName, name, url, flags) => envAdd(projectName, name, url, flags));
env.command("list <project>").description("List a project's environments").action((p) => envList(p));
env.command("default <project> <name>").description("Set the default environment").action((p, n) => envDefault(p, n));
env.command("rm <project> <name>").description("Remove an environment").action((p, n) => envRemove(p, n));

const feature = program.command("feature").description("Manage a project's features (one sheet each)");
feature
  .command("add <project> <name>")
  .description("Add (or update) a feature backed by a Google Sheet")
  .option("--sheet <sheetId>", "Google Sheet id holding this feature's test cases")
  .option("--start-path <path>", "feature start path for recording (default: /)")
  .option("--auth", "mark the feature as requiring auth")
  .option("--no-auth", "mark the feature as public / unauthenticated")
  .action((projectName, name, flags) => featureAdd(projectName, name, flags));
feature.command("list <project>").description("List a project's features").action((p) => featureList(p));
feature
  .command("inspect <project> <name>")
  .description("Show one feature's sheet, envs, recordings, and generated spec paths")
  .option("--json", "emit structured JSON for agents and scripts")
  .action((projectName, name, flags) => featureInspect(projectName, name, flags));
feature.command("rm <project> <name>").description("Remove a feature").action((p, n) => featureRemove(p, n));

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`\n${c.red("✘")} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

main();
