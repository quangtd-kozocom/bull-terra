import { test, expect } from "@playwright/test";

// <bull-terra:manual>
test("TC-3131: 3131", async ({ page }) => {
  await page.goto('http://sumajob.local/');
    await page.getByRole('link', { name: 'マイページ' }).click();
    await page.goto('http://sumajob.local/point-exchange-information/122');
    await page.locator('input[name="postal_code"]').fill('12');
    await page.locator('input[name="address1"]').fill('313131');
    await page.locator('input[name="address2"]').fill('313');
    await page.locator('input[name="tel"]').fill('13131');
    await page.locator('input[name="email"]').fill('13131');
  // TODO: replace this default smoke assertion with one specific to this test case.
  await expect.soft(page.locator("body"), "default smoke assertion").toBeAttached();
});

// </bull-terra:manual>
