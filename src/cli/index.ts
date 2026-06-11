import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import { findProjectRoot } from "../core/paths.js";
import { join } from "node:path";
import { c, CliError } from "./util.js";
import { initCommand } from "./commands/init.js";
import { serveCommand } from "./commands/serve.js";
import { runCommand } from "./commands/run.js";
import { recordCommand } from "./commands/record.js";
import { projectAdd, projectList, projectRemove } from "./commands/project.js";

// Load the installed project's .env so login secrets reach Playwright (PRD §14).
loadEnv({ path: join(findProjectRoot(), ".env"), quiet: true });

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
  .description("Install Chromium, drop the /gen-tests skill, create data.db + config templates")
  .option("--upgrade", "refresh only the gen-tests skill template; leave data.db and .env intact")
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
  .option("--feature <name>", "run a single feature (folder/file under tests/gen/<project>)")
  .option("--writeback", "emit a Google Sheet write-back payload for the MCP step")
  .action(async (flags) => runCommand(flags));

program
  .command("record")
  .description("Record a base navigation flow with `playwright codegen` (the selector source)")
  .option("--project <name>", "project to record for")
  .option("--name <name>", "recording name (default: base)")
  .option("--url <url>", "start URL (default: the project's url)")
  .action(async (flags) => recordCommand(flags));

const project = program.command("project").description("Manage registered projects");
project
  .command("add <name> <url>")
  .description("Register (or update) a project")
  .option("--sheet <sheetId>", "Google Sheet id holding the test cases")
  .action((name, url, flags) => projectAdd(name, url, flags));
project.command("list").description("List registered projects").action(() => projectList());
project.command("rm <name>").description("Remove a project from the registry").action((name) => projectRemove(name));

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
