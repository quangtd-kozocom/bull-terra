import { test, expect } from "@playwright/test";

// <bull-terra:manual>

test("TC-313: 131", async ({ page }) => {
  await page.goto('http://happys.local/login');
    await page.getByRole('textbox', { name: 'ログインID' }).click();
  await expect.soft(false, "TODO: replace with a real assertion").toBe(true);
});

// </bull-terra:manual>
