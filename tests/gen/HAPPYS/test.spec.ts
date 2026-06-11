import { test, expect } from "@playwright/test";

// <bull-terra:manual>

test("TC-313: 1313", async ({ page }) => {
  await page.goto('http://happys.local/staff/1995156432/points');
    await page.locator('#nav-staff_18').getByRole('link', { name: '新規登録' }).click();
    await page.locator('#point_master_id').selectOption('23');
    page.once('dialog', dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      dialog.dismiss().catch(() => {});
    });
    await page.locator('#submit_btn').click();
  await expect.soft(false, "TODO: replace with a real assertion").toBe(true);
});

// </bull-terra:manual>
