import { existsSync } from "node:fs";
import type { FullConfig } from "@playwright/test";

/**
 * Log in once and persist the session so generated specs start authenticated
 * (PRD decision #14 — login once, reuse storageState; secrets stay off-sheet
 * and off-git in .env).
 *
 * This is a TEMPLATE. Fill in your app's login flow. It writes auth.json and
 * points Playwright at it via BULL_TERRA_STORAGE_STATE.
 *
 * Credentials come from .env (see .env.example): APP_<X>_USER / APP_<X>_PASS.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.BASE_URL;
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASS;
  const statePath = "auth.json";

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

  await page.context().storageState({ path: statePath });
  await browser.close();
  process.env.BULL_TERRA_STORAGE_STATE = statePath;
}

export default globalSetup;
