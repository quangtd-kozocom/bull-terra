// Playwright snippets commonly used in recorded flows. Shared by the editor's
// autocomplete (type-to-complete) and the visible "Snippets" palette so both
// stay in sync. `${name}` markers are CodeMirror snippet tab-stops.

export interface PwSnippet {
  /** Autocomplete trigger / palette label. */
  label: string;
  /** One-line hint shown in the menu. */
  detail: string;
  /** CodeMirror snippet template with ${field} tab-stops. */
  template: string;
}

export const PLAYWRIGHT_SNIPPETS: PwSnippet[] = [
  {
    label: "goto",
    detail: "navigate to a URL",
    template: "await page.goto('${url}');",
  },
  {
    label: "click",
    detail: "click an element by role",
    template: "await page.getByRole('${button}', { name: '${name}' }).click();",
  },
  {
    label: "fill",
    detail: "fill a textbox by accessible name",
    template: "await page.getByRole('textbox', { name: '${name}' }).fill('${value}');",
  },
  {
    label: "fillLabel",
    detail: "fill a field by its label",
    template: "await page.getByLabel('${label}').fill('${value}');",
  },
  {
    label: "expectVisible",
    detail: "assert text is visible",
    template: "await expect(page.getByText('${text}')).toBeVisible();",
  },
  {
    label: "expectURL",
    detail: "assert the page URL",
    template: "await expect(page).toHaveURL('${url}');",
  },
  {
    label: "waitForLoad",
    detail: "wait for the network to settle",
    template: "await page.waitForLoadState('networkidle');",
  },
  {
    label: "test",
    detail: "a test() block",
    template: "test('${title}', async ({ page }) => {\n  ${}\n});",
  },
  {
    label: "useStorageState",
    detail: "reuse a captured auth session",
    template: "test.use({ storageState: '${path}' });",
  },
];
