import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const CODEGEN_VIEWPORT_SIZE = "1600, 1000";

/** Make the interactive recorder open with a large, desktop-like viewport. */
export function codegenViewportArgs(): string[] {
  return ["--viewport-size", CODEGEN_VIEWPORT_SIZE];
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

function requireBases(projectRoot: string): string[] {
  return [...new Set([projectRoot, process.cwd(), dirname(fileURLToPath(import.meta.url))])];
}

export function resolvePlaywrightCli(projectRoot: string): PlaywrightCli {
  // `@playwright/test` is the direct (peer) dep; under pnpm's strict layout the
  // transitive `playwright`/`playwright-core` aren't resolvable from the project
  // root, and `exports` blocks the `/cli.js` subpath — so resolve the package
  // ENTRY and find cli.js at its root instead.
  for (const base of requireBases(projectRoot)) {
    const require = createRequire(join(base, "__bull_terra__.js"));
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
  }
  // Last resort — works in any project where `npx playwright` resolves.
  return { command: "npx", prefix: ["playwright"], viaNpx: true };
}

export function requirePlaywrightTest(projectRoot: string): typeof import("@playwright/test") {
  for (const base of requireBases(projectRoot)) {
    const require = createRequire(join(base, "__bull_terra__.js"));
    try {
      return require("@playwright/test") as typeof import("@playwright/test");
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not resolve @playwright/test. Install it in the project where you run bull-terra.");
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
