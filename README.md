# bull-terra — Google Sheet test cases → Playwright specs, with a regression gate

A local UI-testing harness. Turn human-readable test cases in Google Sheets into
runnable Playwright specs (accurate selectors from a recorded base flow), run them
through a live dashboard, and gate regressions in CI. **Green always means
something** — assertions are never weakened to make a test pass.

A project owns many **environments** (local / dev / stg — each a base URL) and many
**features** (one Google Sheet each). The gate is per-environment.

## Install (once)

```bash
npm i -g bull-terra
bull-terra init        # installs Chromium, drops /gen-tests, creates data.db + .env.example
```

> Needs Node ≥ 20 and the Google Sheets MCP (`terra-mcp` / `kozocom-mcp`)
> authenticated in Claude Code — `init` prints pointers but can't provision your
> Google OAuth. If a browser won't open later, run `bull-terra install-browsers`.

## Set up a project

```bash
# 1. A project, and the environment(s) it's deployed to
bull-terra project add app-a
bull-terra env add app-a stg https://stg.app-a.com --default \
  --user-var APP_A_STG_USER --pass-var APP_A_STG_PASS

# 2. A feature, backed by one Google Sheet of test cases
bull-terra feature add app-a checkout --sheet <sheetId>

# 3. Put the login credentials in .env (the var names you chose above)
#    APP_A_STG_USER=...   APP_A_STG_PASS=...
```

## Generate & run

```bash
bull-terra record --project app-a --env stg     # click through the flow once (selector source)
claude "/gen-tests app-a checkout"               # sheet rows → a runnable spec
bull-terra run --project app-a --env stg --all   # exit 1 only when something that worked broke
bull-terra serve                                 # or watch runs live in the dashboard
```

## CLI

| Command | Does |
|---|---|
| `init [--upgrade] [--no-browser]` | Install Chromium, drop the `/gen-tests` skill, create db + config (`--upgrade` refreshes only the skill) |
| `serve [-p <port>] [--no-open] [--dev]` | Local web dashboard |
| `run [--project <p>] [--env <e>] [--all] [--feature <f>] [--writeback]` | Regression gate against one environment |
| `record [--project <p>] [--env <e>] [--name <n>] [--url <u>]` | Record a base flow via codegen (the selector source) |
| `install-browsers [--force]` | Install the Chromium build codegen/runs need |
| `project add <name>` · `project list` · `project rm <name>` | Manage projects |
| `env add <project> <name> <url> [--default --user-var <v> --pass-var <v>]` · `env list <project>` · `env default <project> <name>` · `env rm <project> <name>` | Manage environments |
| `feature add <project> <name> [--sheet <id>]` · `feature list <project>` · `feature rm <project> <name>` | Manage features (one sheet each) |

## Configuration

Secrets live in a gitignored `.env`; bull-terra stores only the *variable names* on
each environment, then injects resolved values into the test process.

| Variable | Purpose |
|---|---|
| `<user-var>` / `<pass-var>` | Login credentials, named per environment via `env add --user-var/--pass-var`. Several envs may share a pair. |
| `BASE_URL` | Injected per run from the environment's URL (don't set it manually). |
| `BULL_TERRA_USER` / `BULL_TERRA_PASS` | Injected per run, resolved from the env's named vars — read these in `global-setup.ts`. |
| `BULL_TERRA_STORAGE_STATE` | Injected per run: `auth/<project>-<env>.json`, one logged-in session per environment. |

## How the regression gate decides

A run fails (exit `1`) **iff** a test that was PASS in the baseline is now FAIL —
compared against the *same environment's* baseline, so a stg pass can't mask a local
break. New tests that never passed are reported but don't gate ("not built yet" ≠
"I broke it"). Tests whose status flips without a code change are quarantined as
flaky so they can't pollute the gate.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Recording fails immediately / no browser opens | `bull-terra install-browsers` (Chromium isn't installed yet) |
| `/gen-tests` can't read the sheet | Authenticate the Google Sheets MCP in Claude Code, then retry |
| Login doesn't work in tests | Check the `--user-var` / `--pass-var` values are filled in `.env` |
| A test fails but it's not a real bug | The sheet's expected result may be wrong — `/gen-tests` never edits assertions, so fix the sheet |
