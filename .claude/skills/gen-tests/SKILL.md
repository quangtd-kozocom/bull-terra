---
name: gen-tests
description: Generate Playwright specs for a bull-terra project/feature from Google Sheet test cases, reusing a recorded base flow as the selector source. Use when the user runs "/gen-tests <project> <feature>", asks to generate or regenerate UI tests for a feature, or after recording a base flow. Query bull-terra through its CLI, especially `bull-terra feature inspect <project> <feature> --json`; do not read SQLite manually. Fixes ONLY selectors/waits/navigation on failure and STOPS on assertion failures — never weakens an assertion.
---

# gen-tests — turn sheet test cases into runnable Playwright specs

Invocation: `/gen-tests <project> <feature>` (e.g. `/gen-tests app-a checkout`).

The whole point of this tool is that **green means something**: you may fix *how* a
test navigates and finds elements, but never *what* it asserts. The rules below all
follow from that.

## 1. Gather inputs

**Config — from bull-terra CLI JSON, not manual SQLite.** A project has MANY
environments and MANY features; don't assume one of each. Always start with:
```bash
bull-terra feature inspect <project> <feature> --json
```
Use that JSON for `stateRoot`, `dbPath`, `feature.sheetId`, `environments`,
`recordings`, `paths.recordingsDir`, `paths.baseRecording`, and `paths.specFile`.
Do not run `sqlite3`, write ad-hoc SQL, or inspect `data.db` directly; the CLI is
the compatibility boundary for migrations and user-level state in `~/.bull-terra`.
If the command says the project/feature is missing, or `hasBaseRecording` is false,
STOP and tell the user to run `bull-terra project add` / `feature add … --sheet
<id>` / `record --project <p> --feature <f> --env <e>` first.

**Test cases — from the feature's own `sheet_id`** via the Google Sheets MCP
(`terra-mcp` / `kozocom-mcp`). It's 1:1, sheet = feature; there is no "project sheet".
Each row has a **TC id** (`TC-01`), title, steps, and an **expected result**. If the
MCP isn't authenticated, STOP and point the user at `bull-terra init`'s MCP setup.

**Selectors — from the feature's recordings.** Read the `base` recording first
(primary flow), then any others as secondary context. These hold real, working
selectors captured by `playwright codegen` — reuse them verbatim. Never invent
selectors from the DOM or guess; this is how we stay accurate without a live-DOM MCP.

## 2. Produce two files

### `recordings/<project>/<feature>/helpers.ts`
Factor recurring navigation/actions out of the recording into small named functions
(`login(page)`, `gotoCheckout(page)`, `addToCart(page, sku)`) so a UI change is a
one-file fix. Update in place on regeneration; keep helper names stable so other
features keep importing them.

### `tests/gen/<project>/<feature>.spec.ts` — one flat `test()` per sheet row
- Title each `test('TC-xx: …')` — the `TC-xx:` prefix links the spec back to the sheet
  row by convention (no manifest). No `describe` nesting: discovery and the regression
  baseline key on the literal title.
- Import the helpers; take assertions **straight from the sheet's expected result**.

**Two regions, marked by HTML comments — you own only the AI region:**
```ts
import { test, expect } from "@playwright/test";

// <bull-terra:ai-generated>
test("TC-01: guest can check out", async ({ page }) => { … });
// </bull-terra:ai-generated>

// <bull-terra:manual>
test("TC-M01: checkout with a coupon", async ({ page }) => { … });
// </bull-terra:manual>
```
- Put every generated test between the `ai-generated` markers and replace only that
  region on regeneration. If the markers are absent, wrap your tests in a fresh pair.
- Never read, edit, reorder, or delete anything in the `manual` region — it's the
  human's, even a failing TODO.
- **First-time migration** (spec has tests but no markers): don't wipe it. Move tests
  you are NOT regenerating from this run's sheet rows into a new `manual` region, put
  generated tests in `ai-generated`, keep the single shared `import`. If you can't tell
  which tests are yours, STOP and ask.

**Keep specs environment-portable** — the same spec runs against every env:
- Navigate relatively (`page.goto('/checkout')`); let Playwright's `baseURL`
  (injected per env as `BASE_URL`) resolve it. Strip the recording's absolute origin.
- Never inline credentials. The session comes from `storageState` (captured per env by
  `global-setup.ts`). If a spec must type credentials, read
  `process.env.BULL_TERRA_USER` / `BULL_TERRA_PASS` — don't paste recorded values.

## 3. Fix loop — selectors/waits ONLY, bounded

Run the specs (default env if `--env` omitted):
```
bull-terra run --project <project> --env <env> --feature <feature>
```
On failure, classify it:

- **Locator / timing / navigation** (selector not found, element not ready, wrong URL,
  missing wait): FIX IT — prefer recording / role-based locators, add
  `await expect(...).toBeVisible()` or `waitFor`, correct the nav. Re-run. **Up to 3
  attempts per test**, then STOP and report what you tried.
- **Assertion failure** (the sheet's expected result didn't hold): **STOP — do not
  touch the assertion.** Report for that TC:
  > `TC-xx` failed its assertion — EITHER a real app bug OR a wrong sheet expectation.
  > I did not change the assertion. Trace: …

  Assertions are ground truth; the human decides. Rewriting one to go green defeats the
  entire tool.

Also: if a sheet row vanished, flag the orphan spec — don't delete it.

## 4. When you finish

List the specs created/updated and TC ids covered, note any rows you couldn't generate
and why, and remind the user they can watch live runs in `bull-terra serve` and that
`bull-terra run --all` is the regression gate.
