import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * How to invoke the Playwright CLI. We prefer the bundled binary resolved from
 * the installed `playwright` / `playwright-core` package over a bare `npx
 * playwright`, because `npx` only resolves when run from a directory whose
 * node_modules contains Playwright — which fails for globally-installed
 * bull-terra users (it's only a *peer* dep of their project). Resolving the
 * package directly and running it with the current Node binary is robust.
 */
export interface PlaywrightCli {
  command: string;
  /** Args that must precede the playwright subcommand (e.g. the cli.js path). */
  prefix: string[];
  /** True when we fell back to `npx` (binary couldn't be resolved). */
  viaNpx: boolean;
}

/** Walk up from a resolved module file to the package root (nearest package.json). */
function packageRoot(entry: string): string | null {
  let dir = dirname(entry);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolvePlaywrightCli(projectRoot: string): PlaywrightCli {
  const require = createRequire(join(projectRoot, "__bull_terra__.js"));
  // `@playwright/test` is the direct (peer) dep; under pnpm's strict layout the
  // transitive `playwright`/`playwright-core` aren't resolvable from the project
  // root, and `exports` blocks the `/cli.js` subpath — so resolve the package
  // ENTRY and find cli.js at its root instead.
  for (const pkg of ["@playwright/test", "playwright", "playwright-core"]) {
    try {
      const root = packageRoot(require.resolve(pkg));
      if (!root) continue;
      const cliPath = join(root, "cli.js");
      if (existsSync(cliPath)) return { command: process.execPath, prefix: [cliPath], viaNpx: false };
    } catch {
      /* try next */
    }
  }
  // Last resort — works in any project where `npx playwright` resolves.
  return { command: "npx", prefix: ["playwright"], viaNpx: true };
}

/** The directory Playwright caches browser binaries in (honoring PLAYWRIGHT_BROWSERS_PATH). */
export function browsersDir(): string {
  const override = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (override && override !== "0") return override;
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Caches", "ms-playwright");
    case "win32":
      return join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "ms-playwright");
    default:
      return join(home, ".cache", "ms-playwright");
  }
}

/** Best-effort check that a Chromium build is installed (preflight before codegen/run). */
export function chromiumInstalled(): boolean {
  const dir = browsersDir();
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((d) => d.startsWith("chromium"));
  } catch {
    return false;
  }
}
