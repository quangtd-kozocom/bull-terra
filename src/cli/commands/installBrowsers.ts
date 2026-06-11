import { spawnSync } from "node:child_process";
import { chromiumInstalled, resolvePlaywrightCli } from "../../core/playwright.js";
import { c, resolvePaths } from "../util.js";

/** `bull-terra install-browsers` — install the Chromium build codegen/runs need. */
export function installBrowsersCommand(flags: { force?: boolean }): void {
  const paths = resolvePaths();
  if (chromiumInstalled() && !flags.force) {
    console.log(`${c.green("✓")} Chromium is already installed.`);
    return;
  }
  const cli = resolvePlaywrightCli(paths.root);
  console.log(c.dim("Installing Chromium for Playwright…"));
  const r = spawnSync(cli.command, [...cli.prefix, "install", "chromium"], {
    cwd: paths.root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status === 0) console.log(`${c.green("✓")} Chromium installed.`);
  else
    console.log(
      c.yellow("! Install failed. Try manually: ") + c.bold("npx playwright install chromium"),
    );
}
