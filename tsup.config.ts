import { defineConfig } from "tsup";

// Bundles the CLI + Hono server + core engine into a single dist/cli.js.
// The Vue SPA is built separately by Vite into dist/ui and shipped in the package,
// so installers never have to run Vite.
export default defineConfig({
  entry: { cli: "src/cli/index.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: false, // the UI is built first into dist/ui — don't wipe it
  sourcemap: true,
  splitting: false,
  shims: true,
  banner: { js: "#!/usr/bin/env node" },
  // Native + heavy peer modules stay external (resolved at the install site).
  external: ["better-sqlite3", "@playwright/test", "playwright", "playwright-core"],
});
