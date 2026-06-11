---
name: gen-tests
description: Generate Playwright specs for a bull-terra project/feature from Google Sheet test cases, reusing a recorded base flow as the selector source. Use when the user runs "/gen-tests <project> <feature>", asks to generate or regenerate UI tests for a feature, or after recording a base flow. Fixes ONLY selectors/waits/navigation on failure and STOPS on assertion failures — never weakens an assertion.
---

# gen-tests — turn sheet test cases into runnable Playwright specs

You are generating Playwright tests for one **feature** of one **project** registered
in bull-terra. The whole value of this tool is that **green means something**, so the
rules below are non-negotiable.

Invocation: `/gen-tests <project> <feature>` (e.g. `/gen-tests app-a checkout`).

## Inputs you must gather first

1. **The project + feature records.** Read `data.db` (SQLite) in the project root:
   - `SELECT id FROM projects WHERE name = '<project>';`
   - `SELECT name, sheet_id FROM features WHERE project_id = <id> AND name = '<feature>';`
   - `SELECT name, url, is_default FROM environments WHERE project_id = <id>;`
   - `SELECT name, path FROM recordings WHERE project_id = <id>;`
   If the project, the feature row, or a recording is missing, STOP and tell the
   user to `bull-terra project add …` / `bull-terra feature add … --sheet <id>` /
   `bull-terra record …` first. A project now has MANY environments (each a base
   URL) and MANY features (each with its own sheet) — do NOT assume one of each.

2. **The test cases from the feature's Google Sheet.** Use the Google Sheets MCP
   (`terra-mcp` / `kozocom-mcp`) to read the rows from the **feature's own
   `sheet_id`** (1:1 sheet = feature — never the "project sheet"; there isn't one).
   Each row is a test case with at least: a **TC id** (e.g. `TC-01`), a
   **title/description**, **steps**, and an **expected result**. If the MCP is not
   authenticated, STOP and point the user at `bull-terra init`'s MCP instructions.

3. **The recorded base flow** = the *selector source*. Read the recording file(s) at
   the `path`(s) from step 1. These contain **real, working selectors** captured by
   `playwright codegen`. Reuse them verbatim wherever possible — do NOT invent
   selectors from the DOM or guess. This is how we get accuracy without a per-run
   live-DOM MCP.

## What to produce

### 1. `recordings/<project>/helpers.ts` — extracted, reusable steps
Factor the recurring navigation/actions out of the recording into small, named
functions so a UI change is a one-file fix (PRD decision #12). Examples:
`login(page)`, `gotoCheckout(page)`, `addToCart(page, sku)`. Each helper uses the
selectors straight from the recording. Update this file in place on regeneration;
keep helpers stable so other features keep importing them.

### 2. `tests/gen/<project>/<feature>.spec.ts` — one `test()` per sheet row
- Title prefix **`TC-xx:`** so the spec links back to the sheet row by convention
  (no manifest). Example: `test('TC-01: guest can check out with a saved card', …)`.
- Keep tests **flat** — one `test()` per case, no `describe` nesting (bull-terra's
  discovery + regression baseline key on the literal title).
- Import and call the helpers for navigation/setup.
- The **assertions come straight from the sheet's "expected result"**. Encode them
  faithfully as `expect(...)`.
- **Make specs environment-portable.** The same spec runs against every
  environment (local / dev / stg), so:
  - NEVER hardcode a host. Use **relative** navigation — `await page.goto('/')`,
    `page.goto('/checkout')` — and let Playwright's `baseURL` (injected per env as
    `BASE_URL`) resolve it. Strip the absolute origin the recording captured.
  - NEVER inline credentials. The logged-in session is provided via
    `storageState` (captured once per env by `global-setup.ts` from
    `BULL_TERRA_USER` / `BULL_TERRA_PASS`). If a spec must type credentials, read
    them from `process.env.BULL_TERRA_USER` / `process.env.BULL_TERRA_PASS` — do
    not paste the values the recording captured.

## The fix loop (bounded) — selectors/waits ONLY

After writing the specs, run them against an environment (default env if `--env`
is omitted):

```
bull-terra run --project <project> --env <env> --feature <feature>
```

(or `BASE_URL=<env-url> npx playwright test tests/gen/<project>/<feature>.spec.ts`)

When a test fails, read the trace/error and classify the failure:

- **Locator / timing / navigation problem** (selector not found, element not ready,
  wrong URL, missing wait): FIX IT. Adjust the selector (prefer ones from the
  recording / role-based locators), add an appropriate `await expect(...).toBeVisible()`
  or `waitFor`, correct the navigation. Re-run. Up to **3 attempts** per test.

- **Assertion failure** (the expected result from the sheet did not hold): **STOP.**
  Do NOT touch the assertion. Report to the user, for that TC:
  > `TC-xx` failed its assertion. This is EITHER a real bug in the app OR the sheet's
  > expected result is wrong. I did not change the assertion. Here is the trace: …
  Let the human decide. This is the integrity rule (PRD §8): assertions are ground
  truth; never rewrite one to make a test pass.

If after 3 selector-fix attempts a test still fails for a non-assertion reason,
STOP and report what you tried.

## When you finish

- List the specs you created/updated and the TC ids covered.
- Note any TC rows you could NOT generate (and why).
- Remind the user they can watch live runs in `bull-terra serve`, and that
  `bull-terra run --all` is the regression gate.

## Hard rules (do not violate)

1. Never edit an assertion to make a test pass.
2. Never invent selectors — reuse the recording; prefer role/label/text locators.
3. One flat `test('TC-xx: …')` per sheet row; no `describe` nesting.
4. On an assertion failure, STOP and report — don't keep "fixing".
5. Don't delete a spec because its sheet row vanished — flag the orphan instead.
6. Never hardcode a host or credentials — relative URLs + `BASE_URL`/storageState
   keep one spec runnable across every environment.
