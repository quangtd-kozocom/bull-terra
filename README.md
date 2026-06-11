# bull-terra

A local, generic **UI-testing harness**: turn human-readable test cases stored in
Google Sheets into runnable Playwright tests, then run them through a live web
dashboard and a **regression-aware CLI gate**.

Two goals:

- **Did I build it right?** — acceptance testing after a task.
- **Did I break something later?** — regression testing before shipping.

Test generation is accurate (real selectors from a recorded base flow) and
trustworthy (**green always means something** — assertions are never weakened to
make a test pass).

## Install

```bash
npm i -g @kozocom/bull-terra
bull-terra init        # installs Chromium, drops the /gen-tests skill, creates data.db + .env.example
bull-terra serve       # opens the local dashboard
```

`bull-terra init --upgrade` refreshes only the `/gen-tests` skill template and leaves
`data.db` and `.env` intact.

> You also need the Google Sheets MCP (`terra-mcp` / `kozocom-mcp`) authenticated in
> Claude Code. `init` prints pointers but cannot provision your Google OAuth.

## Workflow

1. **Register a project** — `bull-terra project add app-a https://app-a.example.com --sheet <sheetId>`
2. **Record a base flow** — `bull-terra record --project app-a` (the *selector source*)
3. **Generate tests** (in Claude Code) — `claude "/gen-tests app-a checkout"`
   Pulls sheet rows → reuses the recording → extracts `helpers.ts` → writes
   `tests/gen/app-a/checkout.spec.ts` with `TC-xx:` titles → runs → fixes only
   selectors/waits → **stops on an assertion failure** (real bug vs wrong test case).
4. **Run / regress** — the dashboard streams results live, or:
   ```bash
   bull-terra run --all        # exits 1 ONLY when a previously-passing test broke
   ```

## CLI

| Command | What it does |
|---|---|
| `bull-terra init [--upgrade] [--no-browser]` | Install Chromium, drop the skill, create db + config |
| `bull-terra serve [-p <port>] [--no-open] [--dev]` | Local web dashboard |
| `bull-terra run [--all] [--project <n>] [--feature <f>] [--writeback]` | Regression-aware gate |
| `bull-terra record [--project <n>] [--name <n>] [--url <u>]` | Record a base flow via codegen |
| `bull-terra project add <name> <url> [--sheet <id>]` | Register/update a project |
| `bull-terra project list` / `project rm <name>` | Manage projects |

## How the regression gate decides

A run fails (exit `1`) **iff** a test that was PASS in the baseline is now FAIL.
New tests that never passed are reported but don't fail the gate ("not built yet"
≠ "I broke it"). Tests whose status flips without a code change are quarantined as
flaky so they can't pollute the gate.

## Development

```bash
pnpm install
pnpm run cli -- --help    # run the CLI from source (tsx)
pnpm run dev:server       # API-only server (port 4317)
pnpm run dev:ui           # Vite dev server (proxies API/SSE to :4317)
pnpm run build            # build the SPA into dist/ui, then bundle the CLI into dist/cli.js
pnpm test                 # vitest unit tests for the core engine
```

## Layout

```
src/core/      shared engine: db, spec discovery, runner, regression gate, writeback
src/cli/       commander CLI (init, serve, run, record, project)
src/server/    Hono server + SSE run streaming + dashboard API
ui/            Vue 3 + Vite + Tailwind dashboard (built into dist/ui)
templates/     shipped by `init`: gen-tests skill, playwright.config, global-setup, CI workflow
```
