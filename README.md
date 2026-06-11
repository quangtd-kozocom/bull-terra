# bull-terra

Google Sheet test cases -> Playwright specs -> regression gate.

Use `bull-terra` when you want non-engineers to maintain test cases in Google
Sheets, then generate and run real Playwright tests locally or in CI.

## Requirements

- Node.js 20+
- Google Sheets MCP authenticated in Claude Code
- A Google Sheet per feature

## Install

```bash
npm i -g bull-terra
bull-terra init
npx skills add quangtd-kozocom/bull-terra
```

## Recommended: Use the Dashboard

After install, start the dashboard:

```bash
bull-terra serve
```

Then use the UI to:

1. Create a project.
2. Add environments and credential variable names.
3. Add features and Google Sheet IDs.
4. Record a base flow for each feature.
5. Copy the generated `/gen-tests` Claude command for a feature.
6. Paste that command into Claude Code.
7. Run all features or one feature from the dashboard.

Generated specs still come from Claude Code:

```bash
claude "/gen-tests app-a checkout"
```

## CLI Quick Start

Use this if you prefer terminal commands:

```bash
# 1. Create a project
bull-terra project add app-a

# 2. Add an environment
bull-terra env add app-a stg https://stg.app-a.com --default \
  --user-var APP_A_STG_USER --pass-var APP_A_STG_PASS

# 3. Add credentials to .env
# APP_A_STG_USER=...
# APP_A_STG_PASS=...

# 4. Link a feature to its Google Sheet
bull-terra feature add app-a checkout --sheet <sheetId>

# 5. Record the feature flow once so generated tests use good selectors
bull-terra record --project app-a --feature checkout --env stg

# 6. Generate Playwright specs from the sheet
claude "/gen-tests app-a checkout"

# 7. Run the regression gate
bull-terra run --project app-a --env stg --all
```

## Daily Use

```bash
bull-terra serve                               # open dashboard
bull-terra run --project app-a --env stg --all # run all features
bull-terra run --project app-a --env stg --feature checkout
```

`run` exits `1` only when a test that previously passed for the same environment
now fails. New tests that never passed are reported but do not fail the gate.

## Concepts

- **Project**: app under test, for example `app-a`.
- **Environment**: deploy target with a base URL, for example `local`, `dev`,
  or `stg`.
- **Feature**: one Google Sheet of test cases, for example `checkout`.
- **Recording**: one manual browser pass used as selector source for generated
  specs. Each feature needs its own `base` recording; extra named recordings can
  provide secondary selector context.
- **Baseline**: previous passing result per environment.

## Commands

| Command | Purpose |
|---|---|
| `bull-terra init [--no-browser]` | Create local files and install Chromium. |
| `bull-terra serve [-p <port>] [--no-open] [--dev]` | Start the dashboard. |
| `bull-terra record --project <p> --feature <f> --env <e>` | Record a feature base flow for selectors. |
| `bull-terra run --project <p> --env <e> --all` | Run the regression gate for all features. |
| `bull-terra run --project <p> --env <e> --feature <f>` | Run one feature. |
| `bull-terra install-browsers [--force]` | Install Chromium for recording/runs. |
| `bull-terra project add/list/rm` | Manage projects. |
| `bull-terra env add/list/default/rm` | Manage environments. |
| `bull-terra feature add/list/rm` | Manage sheet-backed features. |

## Environment Variables

Secrets stay in `.env`. `bull-terra` stores only variable names and injects
resolved values when tests run.

| Variable | Meaning |
|---|---|
| `<user-var>` / `<pass-var>` | Login credentials named by `env add --user-var/--pass-var`. |
| `BASE_URL` | Injected from the selected environment URL. Do not set manually. |
| `BULL_TERRA_USER` / `BULL_TERRA_PASS` | Injected login values for `global-setup.ts`. |
| `BULL_TERRA_STORAGE_STATE` | Injected auth state path: `auth/<project>-<env>.json`. |

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser does not open | Run `bull-terra install-browsers`. |
| `/gen-tests` cannot read the sheet | Authenticate the Google Sheets MCP in Claude Code. |
| Login fails in generated tests | Check the `.env` values named in `env add`. |
| Test passes only after weakening assertions | Do not weaken assertions. Fix the sheet expectation or the app. |
