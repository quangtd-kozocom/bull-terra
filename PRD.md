# PRD — bull-terra (UI-testing harness)

**Author:** quangtd@kozo-japan.com
**Date:** 2026-06-10
**Status:** Draft v1 (design-complete, pre-implementation)

---

## 1. Summary

A **local, generic UI-testing harness** that turns human-readable test cases stored in
Google Sheets into runnable Playwright tests, then runs them through a smooth web
dashboard and a CLI regression gate.

The workflow it enables:

1. A developer finishes a task.
2. Test cases (written by a person or an agent) live in a Google Sheet.
3. **Claude Code** generates Playwright specs from those test cases, reusing a recorded
   base navigation as the selector source.
4. A web dashboard runs the specs, streams results live, and tracks pass/fail history.
5. A CLI regression gate (also used in CI) tells the developer/agent when a change
   **broke something that previously worked**.

It serves two goals:

- **Goal A — "Did I build it right?"** → acceptance testing after a task.
- **Goal B — "Did I break something later?"** → regression testing before shipping new work.

---

## 2. Problem

When a developer completes a feature, they verify it manually and move on. Later changes
silently break earlier features, and nobody notices until it ships. Writing and
maintaining UI tests by hand is slow, and naive LLM test generation produces tests with
wrong selectors that don't run.

We want a low-friction tool that (a) verifies new work and (b) guards against regressions,
with test generation that is **accurate** (real selectors) and **trustworthy** (green
means something).

---

## 3. Goals / Non-goals

### Goals
- Generate Playwright tests from Google Sheet test cases with high selector accuracy,
  **without** the per-run token cost of a live-DOM MCP.
- A regression-aware gate that distinguishes "I broke it" from "not built yet."
- A smooth, low-memory local web dashboard (no Next.js).
- One-command install for other developers (public npm).
- Test generation that never masks real bugs.

### Non-goals (v1)
- Not a hosted multi-tenant service (local tool only).
- Not for non-technical installers (audience is developers with Node + Claude Code).
- No in-app LLM calls / API keys (generation is done by Claude Code).
- Not bundled as a desktop app (Electron/Tauri).

---

## 4. Users

- **Primary:** developers on the team who use Claude Code, have Node installed, and want
  to verify their own work and avoid regressions.
- **Secondary:** QA/PM who author or read test cases **in Google Sheets** (they do not
  install or run the tool; they consume results written back to the Sheet).

---

## 5. Key design decisions (resolved)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Scope | **Generic / multi-app** | Register N projects, each with own URL/sheet/recordings |
| 2 | Deployment | **Local dev tool** | One Node process serves UI + runs Chromium locally; no auth/infra |
| 3 | Frontend | **Vite + Vue + Tailwind (SPA)** | Light, smooth, low memory; explicitly not Next.js |
| 4 | Server | **Hono** | Tiny, fast; serves UI, runs Playwright, streams SSE |
| 5 | Storage | **SQLite (better-sqlite3)** | One local file; trivial history/baseline queries |
| 6 | Generation engine | **Claude Code via `/gen-tests` skill** | No API key, no in-app token cost; reuses subscription |
| 7 | Spec ↔ feature ↔ sheet linking | **Convention + title tags** | Folder = feature, `TC-xx:` title prefix = sheet row; no manifest to drift |
| 8 | Regression gate | **Regression-aware** | Exit 1 only when a previously-passing test now fails |
| 9 | Fix-loop integrity | **Selectors/waits only** | Assertions are ground truth from the sheet; green means something |
| 10 | Selector source | **Recorded base flow (codegen)** | Accurate selectors without per-run MCP token cost |
| 11 | Recording creation | **In-app Record button** | Shells out to `playwright codegen`, saves + registers in SQLite |
| 12 | Reuse model | **Extract to helpers** | UI change = fix one `helpers.ts`, regenerate |
| 13 | Workflow trigger | **Skill + app-surfaced copy command** | Contract versioned in repo; bridges app↔Claude Code seam |
| 14 | Auth & secrets | **`.env` + storageState reuse** | Secrets off-sheet/off-git; login once; solves app-state |
| 15 | Run feedback | **Live stream (SSE)** | Tests tick green/red live; matches "smooth" requirement |
| 16 | Distribution | **Public npm + `bull-terra init`** | One command for any developer; no registry auth |

---

## 6. Architecture

```
                ┌─────────────────────────────┐
                │   CORE ENGINE (shared TS)    │
                │  - read test cases (Sheets)  │
                │  - discover specs (convention)│
                │  - run Playwright            │
                │  - parse JSON report         │
                │  - regression gate vs baseline│
                └─────────────────────────────┘
                      ▲                  ▲
        ┌─────────────┴──────┐   ┌──────┴──────────────┐
        │  WEB UI (Vue/Hono)  │   │   CLI (agents/CI)   │
        │ dashboard, run+SSE, │   │ bull-terra run --all    │
        │ record button       │   │ exit 0/1 on regress │
        └─────────────────────┘   └─────────────────────┘

  Generation (separate, in Claude Code):
        /gen-tests <project> <feature>
          pull sheet (MCP) → read recording → extract helpers.ts
          → write specs (TC-xx titles) → run → fix selectors only
          → assertion fail? STOP + report
```

### Project layout (per installed project)
```
tests/
  base/                         # not used; recordings live below
recordings/<project>/
  <name>.ts                     # raw codegen output (selector source)
  helpers.ts                    # extracted: login(), gotoX(), ...
  .env                          # gitignored: APP_x_USER / APP_x_PASS
tests/gen/<project>/
  <feature>.spec.ts             # generated; test('TC-01: ...') titles
global-setup.ts                 # login once → save auth.json (storageState)
.claude/skills/gen-tests/       # the generation contract (from `bull-terra init`)
data.db                         # SQLite
playwright.config.ts            # trace/screenshot/video on failure
```

### Data model (SQLite)
```
projects(id, name, url, sheet_id)
recordings(id, project_id, name, path)
runs(id, project_id, feature, started_at, status)
results(id, run_id, test_id, title, status, error, trace_path)
baselines(project_id, test_id, last_known_status)
```

---

## 7. Core flows

### 7.1 Generate (in Claude Code)
1. Web dashboard shows ungenerated feature with a **Copy command** button →
   `claude "/gen-tests app-a checkout"`.
2. The `/gen-tests` skill:
   - pulls the feature's rows from Google Sheets (via `kozocom-mcp` / terra-mcp),
   - reads the registered recording, extracts/updates `helpers.ts`,
   - writes `tests/gen/<project>/<feature>.spec.ts` with `TC-xx:` title prefixes,
   - runs the specs,
   - **fixes only selectors/waits/navigation** on failure (bounded retries),
   - on an **assertion** failure, STOPS and reports "real bug OR wrong test case" —
     never edits the assertion.

### 7.2 Run / regress (web app or CLI)
- **Web:** `[Run]` → Hono streams Playwright progress over SSE (live green/red, log tail,
  stop button) → on finish, parse JSON report → write `results`, update `baselines`.
- **CLI:** `bull-terra run --all` → same engine → exit `1` **only** on regressions
  (was PASS, now FAIL). New/never-passed failures are reported but do not fail the gate.
  This is what the agent calls when a task completes, and what CI runs on PRs.

### 7.3 Record (web app)
- `[+ Record base flow]` → spawns `npx playwright codegen <project.url>` → user clicks
  through login + nav → saves to `recordings/<project>/<name>.ts` → registers in SQLite.

---

## 8. Integrity & trust rules (non-negotiable)

- **Assertions are ground truth** from the sheet. The agent may never rewrite an assertion
  to make a test pass.
- **Regression-aware gate** prevents false alarms on work-in-progress.
- **Flaky-test quarantine** (see v1 additions) keeps the gate trustworthy.
- **Green always means something** — this is the core value proposition.

---

## 9. v1 feature additions (beyond the spine)

Baked into v1 because they reinforce trust and close the loop cheaply:

1. **Trace + screenshot + video on failure** — `trace: 'on-first-retry'`,
   `screenshot: 'only-on-failure'`. Dashboard links to the trace. Powers the
   "real bug vs wrong test case" triage.
2. **Flaky-test detection** — use SQLite history to flag tests that flip status without a
   code change; quarantine them so they don't pollute the regression gate.
3. **Write results back to the Sheet** — after a run, write `status + last-run + trace
   link` into each sheet row via MCP, so QA/PM see pass/fail without the app.
4. **CI gate (GitHub Actions)** — the same regression-aware CLI runs on every PR, so
   Goal B is enforced for the whole team automatically.

Deferred (post-v1, additive):
- Visual regression / screenshot diffing (`toHaveScreenshot`), opt-in per feature.
- Accessibility assertions (axe-core).
- Diff-aware test selection (changed files → affected features).
- Coverage-gap suggestions (agent flags untested routes/paths).
- Notifications on regression (Slack/email).

---

## 10. Distribution & install

- **Publish:** public npm. `npm publish --access public`. Pre-build the Vue SPA into the
  package (`dist/ui`) so installers never run Vite. `bin: { "bull-terra": "dist/cli.js" }`.
  Ensure `files` allowlist excludes `.env`, `data.db`, recordings, traces.
- **Install (any developer):**
  ```bash
  npm i -g @kozocom/bull-terra        # or unscoped name
  bull-terra init                     # installs Chromium, drops the skill, creates db, .env.example
  bull-terra serve                    # opens the local dashboard
  ```
- **`bull-terra init`** does: `npx playwright install chromium` (explicit, not postinstall),
  copy the `gen-tests` skill into `.claude/skills/`, create `data.db`, write `.env.example`,
  and print MCP/credentials setup pointers.
- **Updates:** `npm i -g @kozocom/bull-terra@latest` then `bull-terra init --upgrade`
  (refreshes the skill template only; leaves `data.db` and `.env` intact).
- **External dependency:** each developer needs the Google Sheets MCP creds
  (`kozocom-mcp` OAuth) set up separately; `init` checks for it and prints instructions
  but cannot provision someone's Google OAuth.

---

## 11. Build order (de-risked)

1. **Core engine + CLI** — read sheet, discover specs by convention, run Playwright, parse
   JSON, write SQLite, regression-aware exit code. Delivers Goal B headless, no UI.
2. **`/gen-tests` skill** — encodes the generation contract (helpers, TC-xx titles,
   selectors-only fixing, assertion-stop).
3. **Web dashboard (Vue + Hono + SSE)** — projects list, feature/test-case status, Run with
   live stream, Record button, trace links.
4. **v1 additions** — trace config, flaky detection, sheet write-back, CI workflow.
5. **Package + publish** to public npm with `init`/`--upgrade`.

---

## 12. Open questions (deferred, not blocking)

- **Parallelism:** v1 assumes one run at a time locally. Revisit if needed.
- **Stale specs:** when a sheet row is deleted, **flag** the orphaned spec rather than
  auto-deleting it (safer default).
- **MCP onboarding:** smoothest way to get teammates through Google OAuth for the Sheets MCP.

---

## 13. Success criteria

- A developer can: register a project → record a base flow → `/gen-tests` a feature →
  see green/red in the dashboard, all without hand-writing selectors.
- Running `bull-terra run --all` after a change exits `1` iff a previously-passing test broke.
- A second developer can install and be running in under ~5 minutes with two commands.
- No generated suite ever goes green by weakening an assertion.
