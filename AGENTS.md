# AGENTS.md

## Project

`bull-terra` is a local UI-testing harness. It turns Google Sheet test cases into runnable Playwright specs, runs them through a Hono-backed dashboard, and gates regressions per environment.

## Stack

- Node.js >= 20, TypeScript, ESM.
- Package manager: `pnpm@11.5.2`.
- CLI/server code lives in `src/`.
- Dashboard lives in `ui/` and uses Vue 3, Vite, Tailwind CSS 4, and TypeScript.
- Tests use Vitest. Generated customer test projects use Playwright templates from `templates/`.
- Build output goes to `dist/`; do not edit generated build output.

## Repo Layout

- `src/cli/`: command definitions and CLI entrypoint.
- `src/core/`: project discovery, DB, runner, gate, Playwright integration, writeback.
- `src/server/`: Hono server, API views, run manager, dashboard serving.
- `ui/src/`: Vue dashboard components, API client, types, composables, styles.
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
- Store secrets only in `.env` or user environment variables. The app should store variable names, not secret values.
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
