import open from "open";
import { startServer } from "../../server/app.js";
import { c, resolvePaths } from "../util.js";

export interface ServeFlags {
  port?: string;
  open?: boolean; // commander --no-open => open:false
  dev?: boolean; // dev mode: don't serve built SPA / don't auto-open (Vite owns the UI)
}

/** `bull-terra serve` — the local dashboard (PRD §7.2). */
export async function serveCommand(flags: ServeFlags): Promise<void> {
  const paths = resolvePaths();
  const port = Number(flags.port ?? (flags.dev ? 4317 : 4317));

  const { url } = await startServer({ paths, port, serveUi: !flags.dev });

  console.log(`\n  ${c.bold("bull-terra")} dashboard → ${c.cyan(url)}`);
  if (flags.dev) {
    console.log(c.dim(`  dev mode: API only. Run the UI with \`npm run dev:ui\` (proxies here).`));
  }
  console.log(c.dim("  Press Ctrl+C to stop.\n"));

  if (!flags.dev && flags.open !== false) {
    try {
      await open(url);
    } catch {
      /* headless / no browser — ignore */
    }
  }
}
