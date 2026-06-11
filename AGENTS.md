# AGENTS.md

## Project

`bull-terra` is a local UI-testing harness. It turns Google Sheet test cases into runnable Playwright specs, runs them through a Hono-backed dashboard, and gates regressions per environment. A project has many environments (each a base URL) and many features (each with its own sheet, start path, and recordings) — never assume one of each.

Key concepts:
- **Feature-scoped recordings**: `playwright codegen` recordings are attached to a feature (`feature_id`) and stored under `recordings/<project>/<feature>/`. They are the *selector source* for generated specs. Legacy project-level recordings (`feature_id = NULL`) still exist but new flows must be feature-scoped.
- **Auth storageState**: features can be marked `requires_auth`; the dashboard captures a per-environment storageState into `recordings/<project>/.auth/<env>.json`, which recording/runs load via `--load-storage`. Recording an auth-required feature without captured state errors early. (Legacy `auth/<project>-<env>.json` files are migrated on startup.)
- **Run artifacts**: each run's Playwright output (failure screenshots, traces, opt-in videos) lands in `recordings/<project>/.runs/run-<id>/`, served to the dashboard via `GET /api/artifact`. Runs accept a `video` option (CLI `--video`, dashboard "record video" toggle) that records every test for handoff to testers.
- **Manual vs AI regions**: a feature spec is split by HTML-comment markers into a `<bull-terra:ai-generated>` region (owned by the `gen-tests` skill, replaced on regeneration) and a `<bull-terra:manual>` region (human-promoted `TC-Mxx` tests, never touched by regeneration). Recordings can be *promoted* into manual tests from the dashboard.

## Stack

- Node.js >= 20, TypeScript, ESM.
- Package manager: `pnpm@11.5.2`.
- CLI/server code lives in `src/`.
- Dashboard lives in `ui/` and uses Vue 3, Vite, Tailwind CSS 4, and TypeScript.
- Tests use Vitest. Generated customer test projects use Playwright templates from `templates/`.
- Build output goes to `dist/`; do not edit generated build output.

## Repo Layout

- `src/cli/`: command definitions and CLI entrypoint (`record` takes `--feature`; `feature add` takes `--start-path`/`--auth`/`--no-auth`).
- `src/core/`: project discovery, DB, runner, gate, Playwright integration, writeback. Notable modules:
  - `paths.ts`: path helpers; use `safePathSegment` and `featureRecording*` for all on-disk names.
  - `auth.ts`: storageState location/freshness, `requires_auth` gating, `featureStartUrl`, start-path normalization, legacy auth-file migration.
  - `manual-tests.ts`: `TC` id normalization, codegen-body extraction, and appending promoted tests into the `<bull-terra:manual>` region.
  - `schema.ts`: Drizzle schema plus idempotent migrations (`migrateFeatureScopedRecordings`, `migrateFeatureRecordingOptions`, etc.).
- `src/server/`: Hono server, API views, run manager, dashboard serving. New routes cover auth capture, recording preview/delete/promote, per-feature recording creation, and clearing a feature's generated tests.
- `ui/src/`: Vue dashboard components, API client, types, composables, styles. Includes `RecordingsManager`, `RecordingPreviewDialog`, and `PromoteTestDialog`.
- `templates/`: files copied into initialized projects (playwright config, global-setup, .env.example).
- `skills/`: the published `gen-tests` skill, installed by consumers via skills.sh.
- `.agents/skills/`: local skills used by coding agents.

## Commands

- `pnpm run dev:server`: run the CLI server in dev mode.
- `pnpm run dev:ui`: run the dashboard Vite dev server.
- `pnpm run build`: build dashboard and CLI package.
- `pnpm run build:ui`: build only the dashboard.
- `pnpm run build:cli`: build only the CLI/server bundle.
- `pnpm run typecheck`: TypeScript check for `src/`.
- `pnpm test`: run Vitest.
- `pnpm run cli -- <args>`: run the local CLI through `tsx`.

## Coding Rules

- Keep changes scoped to the requested behavior.
- Preserve strict TypeScript settings; fix unused locals and unused parameters instead of suppressing them.
- Keep CLI behavior and dashboard API contracts aligned when changing `src/server`, `src/core`, or `ui/src/api.ts`.
- Store secrets only in `.env` or user environment variables. The app should store variable names, not secret values. Auth storageState files live under `recordings/<project>/.auth/` and must not be committed.
- Use `safePathSegment` / the `featureRecording*` path helpers for any on-disk project, feature, env, or recording name — do not hand-roll sanitization.
- When changing the data model, add an idempotent migration in `schema.ts` (guard on `PRAGMA table_info`) instead of mutating existing rows destructively; existing installs must keep working.
- Never have automated regeneration touch the `<bull-terra:manual>` region of a spec; only the `<bull-terra:ai-generated>` region is machine-owned.
- Do not weaken generated Playwright assertions to make tests pass.
- Do not edit unrelated dirty files.
- Do not add dependencies unless the existing stack cannot reasonably solve the problem.

## Dashboard Rules

- Use `/home/quang/Projects/kozocom/bull-terra/.agents/skills/vue-best-practices` for Vue work, including `.vue` files, Vue 3 Composition API, Vue Router, Pinia, Vite-with-Vue, and dashboard changes.
- Use Vue 3 Composition API with `<script setup>` for Vue work.
- Keep dashboard state and API types synchronized with `ui/src/types.ts`.
- Run `pnpm run build:ui` after dashboard changes when feasible.

## Verification

- For TypeScript-only changes, run `pnpm run typecheck`.
- For behavior covered by tests, run `pnpm test`.
- For release/build-sensitive changes, run `pnpm run build`.
- If verification cannot run, state why and describe the residual risk.

## Agent Skills

- Use the `caveman` skill when answering questions in this repo unless the user asks for normal wording or the answer needs extra clarity for safety.
- After completing JavaScript or TypeScript changes, use `fallow` to find cleanup opportunities such as dead code, unused exports, unused dependencies, duplication, and complexity hotspots. Use JSON quiet output and dry-run before any fix:
  - `fallow dead-code --format json --quiet --explain 2>/dev/null || true`
  - `fallow fix --dry-run --format json --quiet --explain 2>/dev/null || true`
- Apply Fallow fixes only after reviewing the preview and only when the cleanup is directly related to the work.
