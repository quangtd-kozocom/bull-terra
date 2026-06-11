import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FullConfig } from "@playwright/test";

/**
 * Log in once and persist the session so generated specs start authenticated
 * (PRD decision #14 — login once, reuse storageState; secrets stay off-sheet
 * and off-git in .env).
 *
 * This is a TEMPLATE. Fill in your app's login flow. bull-terra injects, per
 * environment:
 *   BASE_URL                 the env's base URL
 *   BULL_TERRA_USER / _PASS  resolved from the .env vars the env names
 *   BULL_TERRA_<KEY>         any other secret the env registers via
 *                            `env add … --var KEY=ENV_VAR_NAME` (e.g. an
 *                            API_KEY var → process.env.BULL_TERRA_API_KEY)
 *   BULL_TERRA_STORAGE_STATE  recordings/<project>/.auth/<env>.json (one session per env)
 *
 * So this file is env-agnostic: the same flow re-runs per target with the right
 * URL, credentials, and storage-state path supplied from the outside.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.BASE_URL;
  const user = process.env.BULL_TERRA_USER;
  const pass = process.env.BULL_TERRA_PASS;
  const statePath = process.env.BULL_TERRA_STORAGE_STATE || "auth.json";

  // No credentials configured → run unauthenticated (fine for public flows).
  if (!baseURL || !user || !pass) {
    process.env.BULL_TERRA_STORAGE_STATE = existsSync(statePath) ? statePath : "";
    return;
  }

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // ── EDIT THIS to match your app's login ──────────────────────────────────
  await page.goto(baseURL);
  // await page.getByLabel("Email").fill(user);
  // await page.getByLabel("Password").fill(pass);
  // await page.getByRole("button", { name: "Sign in" }).click();
  // await page.waitForURL("**/dashboard");
  // ─────────────────────────────────────────────────────────────────────────

  mkdirSync(dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
  await browser.close();
  process.env.BULL_TERRA_STORAGE_STATE = statePath;
}

export default globalSetup;
