import { test, expect } from "@playwright/test";

// <bull-terra:manual>

test("TC-31: 313131", async ({ page }) => {
  await page.goto('http://happys.local/staff/1995156432/points');
    await page.locator('#nav-staff_18').getByRole('link', { name: '新規登録' }).click();
    await page.locator('#point_master_id').selectOption('22');
    page.once('dialog', dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      dialog.accept();
    });
    await page.locator('#submit_btn').click();
  // TODO: replace this default smoke assertion with one specific to this test case.
  await expect.soft(page.locator("body"), "default smoke assertion").toBeVisible();
});

// </bull-terra:manual>
