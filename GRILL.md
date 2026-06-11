 Question 1: Should every feature have a configured start URL/path?

  Example:

  feature: checkout
  sheet: ...
  start path: /checkout
  base recording: recordings/app/checkout/base.ts

  Then Record base opens:

  <env.url> + <feature.startPath>

  instead of env homepage.

  Recommended answer: yes. Add features.start_path, default /, editable in dashboard. This
  solves “I have to navigate to correct UI every time.”


› Yes.


• Good.

  Decision 1: feature has start_path.

  Example:

  checkout.start_path = /checkout
  profile.start_path = /settings/profile

  Recording URL becomes:

  env.url + feature.start_path

  Next dependency: auth.

  There are two possible auth models:

  Option A: Global setup auth
  User writes login once in tests/global-setup.ts. bull-terra auth runs it and saves auth/
  <project>-<env>.json. Record uses --load-storage.

  Good for stable apps. Bad: user must code login flow once.

  Option B: Interactive auth capture
  User clicks “Login once”. Browser opens, user logs in manually, app saves storage state.
  Future recordings use that state.

  Good UX. No code needed for login. Bad: if session expires, user repeats login.

  Option C: both.

  Recommended answer: Option C, with B as primary UX:

  - Dashboard has Auth session per env.
  - Click Login once.
  - It opens browser, user logs in, closes.
  - Saves storage state.
  - Record base loads that state and starts at feature start_path.
  - global-setup.ts remains advanced/CI path.

  Question 2: Should dashboard support interactive “Login once” auth capture per
  environment, then reuse it for recording?


› C


• Good.

  Decision 2: support both auth paths.

  Primary local UX:

  Env: stg
  [Login once] -> saves auth/app-stg.json
  [Record base] -> loads auth/app-stg.json, opens /checkout

  Advanced/CI UX:

  global-setup.ts + .env secrets

  Next branch: how to capture interactive auth.

  Playwright has codegen options, but for auth capture we should not record selectors. We
  just need browser context storage state.

  Option A: launch small Playwright script:

  - open env URL
  - user logs in manually
  - waits until browser closes
  - save storage state

  Option B: use playwright codegen --save-storage.
  Good if supported by installed Playwright version, simpler. But still opens recorder UI,
  maybe confusing.

  Option C: use normal browser automation with local helper page / terminal prompt.

  Recommended answer: Option A. It gives clean UX: no codegen inspector, just browser.
  Dashboard can say “Close browser when logged in.”

  Question 3: Should Login once use a plain Playwright browser session, not codegen, and
  save storage state when browser closes?


› A


• Good.

  Decision 3: Login once = plain Playwright browser, not codegen.

  Behavior:

  POST /api/projects/:project/auth/:env/capture

  Server:

  - launch Chromium
  - create context
  - open env URL, maybe feature start path optional later
  - user logs in manually
  - when browser closes, save:

  auth/<project>-<env>.json

  Then record:

  - if auth state exists, pass it into codegen
  - if missing, warn but allow unauthenticated recording

  Next branch: recording command behavior when auth state missing.

  Option A: block record until auth captured.
  Bad for public flows.

  Option B: allow record unauthenticated, but show warning.

  Option C: feature/env setting: requiresAuth.

  Recommended answer: Option C, but implement B first unless user marks env/feature as
  auth-required. Because some flows are public.

  Question 4: Should features have requires_auth boolean so dashboard can block recording/
  generation until env auth state exists?


› C


• Good.

  Decision 4: feature has requires_auth.

  Behavior:

  requires_auth = true

  Then:

  - Record base blocked if selected env has no auth state.
  - UI says Login once first.
  - record launches codegen with stored auth.
  - generated tests use storageState too.

  If:

  requires_auth = false

  Then record can run without auth.

  Next branch: where requires_auth belongs.

  Option A: feature-level only.
  Good: checkout/profile need auth; landing page/search may not.

  Option B: environment-level only.
  Bad: same env can host public and private flows.

  Option C: both env default + feature override.
  More complex.

  Recommended answer: Option A. Simple and enough.

  Question 5: Should requires_auth be feature-level only?


› A


• Good.

  Decision 5: requires_auth lives on feature.

  Feature fields now:

  name
  sheet_id
  start_path
  requires_auth

  Next problem: human-generated tests from recording.

  There are actually two different desires:

  Option A: Human records a flow, and bull-terra converts recording into a Playwright test
  skeleton.
  Human then edits assertions manually.

  Option B: Human writes full spec file manually in editor. Dashboard just discovers and
  runs it.

  Option C: Dashboard has “Create manual test case” form:

  - TC id
  - title
  - choose recording
  - choose assertion template
  - writes spec

  Recommended answer: Option A + B first.

  - A gives quick start from recording.
  - B already mostly works: any .spec.ts under tests/gen/<project>/ is discovered.
  - C is nice but bigger and easy to make clunky.

  Question 6: Should first human path be “promote recording to editable test skeleton,”
  while still allowing manually written spec files?


› A and B


• Good.

  Decision 6: support both:

  A. Promote recording to test skeleton
  Input:

  recording: recordings/app/checkout/base.ts
  TC id: TC-01
  title: user can checkout

  Output:

  tests/gen/app/checkout.spec.ts

  with:

  test("TC-01: user can checkout", async ({ page }) => {
    // actions copied from recording
    // TODO: add assertions
  });

  B. Manual spec files still supported
  Any valid flat test under:

  tests/gen/<project>/<feature>.spec.ts

  appears in dashboard.

  Next branch: where promoted tests live if AI also generates same feature spec.

  Option A: same feature spec file, append manual tests.
  Good: same dashboard feature, same gate.

  Option B: separate file:

  checkout.manual.spec.ts

  Bad: feature naming/discovery may become checkout.manual.

  Option C: separate folder:

  tests/manual/...

  Bad: runner/discovery changes.

  Recommended answer: Option A, append to same feature spec. Need preserve human blocks
  when AI regenerates later.

  Question 7: Should manual promoted tests be appended to the same feature spec file, and
  protected from AI overwrite?


› A


• Good.

  Decision 7: manual tests live in same feature spec.

  Need protect them.

  Spec file should have sections:

  // <bull-terra:ai-generated>
  ...
  // </bull-terra:ai-generated>

  // <bull-terra:manual>
  test("TC-M01: ...", async ({ page }) => {
    ...
  });
  // </bull-terra:manual>

  Then /gen-tests replaces only AI section, leaves manual section alone.

  Next branch: generated test source from recording.

  Option A: copy recording actions verbatim inside test.
  Fast, but duplicates and can include codegen boilerplate.

  Option B: convert recording into helper function, then test calls helper.
  Cleaner, but harder.

  Option C: offer both.

  Recommended answer: Option A first for human path. Human wants editable skeleton. Keep
  it direct and visible.

  Question 8: Should “promote recording” copy actions directly into the new manual test
  body, not hide them in helper?


› A


• Good.

  Decision 8: manual promoted skeleton copies actions directly into test.

  Next branch: assertions.

  Option A: leave // TODO: add assertions, test should fail until assertion added.
  Bad if user accidentally gates a no-assertion pass.

  Option B: add forced failing assertion:

  expect.soft(false, "TODO: add assertion").toBe(true)

  Good: manual skeleton cannot silently pass.

  Option C: let user choose basic assertion during promotion.

  Recommended answer: Option B now. Integrity rule: no no-assertion pass. Later add
  templates.

  Question 9: Should promoted manual test include a failing TODO assertion so it cannot
  pass until human adds real assertions?


› B


• Good.

  Decision 9: manual skeleton starts failing by design.

  Example:

  await expect.soft(false, "TODO: replace with real assertion").toBe(true);

  This means:

  - run reports new failure
  - gate does not fail until it once passed
  - human must edit assertion to make it meaningful

  Next branch: dashboard flow for human promote.

  Option A: from recording browser:
  [Promote to test]
  Dialog asks TC id + title.

  Option B: from feature card:
  [New manual test]
  Dialog picks recording + TC id + title.

  Option C: both.

  Recommended answer: Option C eventually, Option A first. Because recording is source
  material.

  Question 10: Should first UI expose “Promote to test” from recording preview/browser?

⚠ Heads up, you have less than 25% of your 5h limit left. Run /status for a breakdown.


› A


/status

╭─────────────────────────────────────────────────────────────────────────────────╮
│  >_ OpenAI Codex (v0.139.0)                                                     │
│                                                                                 │
│ Visit https://chatgpt.com/codex/settings/usage for up-to-date                   │
│ information on rate limits and credits                                          │
│                                                                                 │
│  Model:                gpt-5.5 (reasoning medium, summaries auto)               │
│  Directory:            ~/Projects/kozocom/bull-terra                            │
│  Permissions:          Workspace (Ask for approval)                             │
│  Agents.md:            AGENTS.md                                                │
│  Account:              honkaiapolos@gmail.com (Plus)                            │
│  Collaboration mode:   Default                                                  │
│  Session:              019eb54d-9731-76f0-aa68-e57770c43639                     │
│                                                                                 │
│  Context window:       54% left (126K used / 258K)                              │
│  5h limit:             [█████░░░░░░░░░░░░░░░] 25% left (resets 16:24)           │
│  Weekly limit:         [██████████████████░░] 88% left (resets 11:24 on 18 Jun) │
╰─────────────────────────────────────────────────────────────────────────────────╯

• Good.

  Decision 10: first UI: recording browser has Promote to test.

  Dialog fields:

  TC id: TC-M01
  Title: user can checkout with coupon

  Then server:

  - reads recording source
  - extracts actions
  - appends manual test into tests/gen/<project>/<feature>.spec.ts
  - creates/keeps manual section
  - dashboard refreshes discovered tests

  Next branch: what recordings can be promoted.

  Option A: only feature-scoped recordings.
  Recommended. Shared legacy recordings have no feature target unless user picks one.

  Option B: allow shared recording and ask feature.

  Recommended answer: Option A now. Shared legacy remains preview-only.

  Question 11: Should only feature-scoped recordings be promotable to manual tests?


› A


• Good.

  Decision 11: only feature recordings can be promoted.

  Next branch: auth state in dashboard.

  Need show per env auth state.

  Option A: simple badge:

  Auth: ready / missing
  [Login once]

  Option B: richer:

  Auth state path, last modified, delete/reset

  Option C: both: compact badge plus advanced details.

  Recommended answer: Option B in EnvManager. Since this is operational and debugging
  matters.

  Fields server can compute:

  authStatePath
  authStateExists
  authStateUpdatedAt

  Question 12: Should EnvManager show auth state path + ready/missing + Login once action?


› B


• Good.

  Decision 12: EnvManager shows auth details:

  Auth ready
  auth/app-stg.json
  updated 2026-06-11 14:20
  [Login once]

  Or:

  Auth missing
  auth/app-stg.json
  [Login once]

  Next branch: what URL should Login once open?

  Option A: env base URL.
  Good general.

  Option B: selected feature start path.
  Good if login page redirects weirdly.

  Option C: ask/open optional URL.

  Recommended answer: Option A first. Auth is env-level, not feature-level. After login,
  state works for feature paths.

  Question 13: Should Login once open env base URL by default?


› A


• Good.

  Decision 13: Login once opens env base URL.

  Next branch: recording URL.

  Feature has start_path, env has base URL.

  Need compose URL safely.

  Option A: simple string concat.
  Bad with slashes.

  Option B: new URL(start_path, env.url).toString().
  Good.

  Recommended answer: B.

  Also rule: start_path should be path/relative only, not full external URL.

  Question 14: Should feature start_path be constrained to /path or relative path, and
  composed with new URL(start_path, env.url)?


› B


• Good.

  Decision 14: feature start_path is path/relative only.

  Examples valid:

  /
  checkout
  /checkout?coupon=1

  Invalid:

  https://other-site.com/checkout

  Recording URL:

  new URL(feature.start_path, env.url).toString()

  Next branch: codegen auth option.

  Playwright supports storage state for codegen via CLI option? Need verify exact current
  flag before implementing later. It has historically been:

  npx playwright codegen --load-storage=auth.json
  npx playwright codegen --save-storage=auth.json

  But must confirm against installed version with pnpm exec playwright codegen --help.

  Recommended implementation should discover support and fail clearly if missing.

  Question 15: Should record use --load-storage <authStatePath> when auth exists, and
  hard-block only when feature requires_auth = true but file missing?


› Yup


• Good.

  Decision 15: record behavior:

  if auth exists:
    playwright codegen --load-storage auth/app-stg.json <featureStartUrl>

  if auth missing and requires_auth = true:
    block, tell user click Login once

  if auth missing and requires_auth = false:
    allow unauthenticated record

  Next branch: generation/human tests and auth.

  For generated tests, playwright.config.ts already uses:

  storageState: process.env.BULL_TERRA_STORAGE_STATE || undefined

  So as long as run env points to auth/<project>-<env>.json, tests use it.

  But if requires_auth = true and auth state missing at run time:

  Option A: let global setup try to create it.
  Good for CI.

  Option B: block local run until auth exists.
  Bad for CI if global setup can create it.

  Option C: if env credentials exist, run; else block/warn.

  Recommended answer: Option C.

  - If auth state missing but env has secret var names, global-setup.ts may create it.
  - If no auth state and no secret vars, block requires_auth feature run with clear error.

  Question 16: Should runs for auth-required features require either existing auth state
  OR configured secret vars for global setup?


› C


• Good.

  Decision 16: auth-required run preflight:

  Allowed if either:

  auth state file exists

  or:

  env.secret_vars has USER/PASS names

  Blocked if neither exists.

  This supports:

  - local interactive auth
  - CI/global setup auth

  Next branch: sheet/AI generation with human manual tests.

  When /gen-tests regenerates feature spec:

  Option A: generator must preserve manual section markers.
  Option B: generator can overwrite entire file; manual tests should live elsewhere.
  Already chose same file, so A required.

  Recommended update to skill:

  Only replace content between <bull-terra:ai-generated> markers.
  Never edit <bull-terra:manual>.
  If markers missing, migrate carefully: keep unknown tests in manual section.

  Question 17: Should unknown existing tests be preserved as manual tests when /gen-tests
  first introduces markers?


› Update


• Interpreting “Update” as: yes, update /gen-tests behavior to preserve unknown existing
  tests as manual tests.

  Decision 17: first marker migration preserves unknown tests.

  Rule:

  // <bull-terra:ai-generated>
  AI-owned tests here
  // </bull-terra:ai-generated>

  // <bull-terra:manual>
  existing unknown tests + promoted manual tests here
  // </bull-terra:manual>

  If old spec has no markers:

  - /gen-tests should not wipe file.
  - It should move existing tests into manual section or stop and ask human if unsure.
  - Future AI regen only replaces AI section.

  Next branch: implementation scope.

  We now have two feature sets:

  1. Auth/start path
      - feature start_path
      - feature requires_auth
      - env auth state metadata
      - Login once
      - record uses feature start path + auth storage

  2. Human tests from recordings
      - promote recording to manual test skeleton
      - manual section markers
      - /gen-tests preserve manual section

  Recommended implementation order:

  1. Auth/start path first, because recording usability is blocking.
  2. Human promotion second.

  Question 18: Should we implement auth/start path first, then manual-test promotion
  after?


› Yup


• Good.

  Decision 18: implementation order:

  1. Auth/start path
  2. Human recording-to-test promotion

  Next branch before implementation: Login once completion model.

  Plain Playwright browser can save state when browser closes. Dashboard request will stay
  pending until user closes browser.

  Option A: keep HTTP request open until browser closes.
  Simple but request may feel hanging; okay because recording already works this way.

  Option B: fire-and-forget session, poll status.
  More complex.

  Recommended answer: Option A for now, same as record.

  Question 19: Should Login once API request stay pending until user closes browser, then
  save auth state and return?


› A


• Good.

  Decision 19: Login once pending request until browser closes.

  UX:

  - toast: “Login browser opened. Close it after login.”
  - button loading
  - after close: refresh env auth metadata

  Next branch: manual promote extraction quality.

  Recording files from codegen include imports and test(...). To promote, server must
  extract action body.

  Option A: simple parser/string extraction for first test(... async ({ page }) =>
  { ... }).
  Fast but brittle.

  Option B: TypeScript AST parse.
  More robust, extra code but no new dependency if TypeScript available in dev? Runtime
  package currently has typescript dev only, not dependency.

  Option C: keep entire recording file as comment and ask human to copy.
  Bad.

  Recommended answer: Option A first, but constrained:

  - promote only codegen-style files
  - if cannot parse, return error
  - preserve source preview so human can still manually copy

  Question 20: Is simple extraction of the first codegen test body acceptable for initial
  manual promotion?


› A


• Good.

  Decision 20: simple extraction acceptable.

  Next branch: promoted test ID.

  Manual tests need TC id. If human enters M01, normalize to TC-M01? Existing parseTcId
  expects TC-....

  Option A: require full TC-xx.
  Option B: auto-prefix TC-.
  Option C: allow any but warn dashboard cannot link.

  Recommended answer: Option B. User friction lower, dashboard still consistent.

  Question 21: Should promote dialog auto-normalize M01 or 01 into TC-M01 / TC-01?


› B


• Good.

  Decision 21: normalize TC id.

  Rule:

  TC-01 -> TC-01
  01    -> TC-01
  M01   -> TC-M01

  Next branch: what should I do now?

  We have enough decisions. I can implement both phases now.

  Implementation checklist:

  - DB/schema: add features.start_path, features.requires_auth
  - server views/types/API update
  - env auth metadata
  - Login once endpoint with Playwright browser
  - record URL = env + feature start path; load auth state when present
  - UI feature dialog fields
  - EnvManager auth state + login action
  - record preflight for auth-required features
  - skill docs marker preservation
  - promote endpoint + UI button/dialog
  - tests
