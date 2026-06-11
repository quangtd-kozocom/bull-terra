import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { DiscoveredTest } from "./types.js";

const SPEC_RE = /\.spec\.ts$/;
// Matches test('...'), test("..."), test(`...`), incl. test.only / test.skip / test.fixme.
const TEST_CALL_RE = /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const TC_PREFIX_RE = /^(TC-?\d+)\s*[:.-]/i;

/** A stable id for a test, shared by discovery + the JSON-report parser. */
export function makeTestId(specRelPath: string, title: string): string {
  return `${specRelPath.split("\\").join("/")}>${title}`;
}

export function parseTcId(title: string): string | null {
  const m = title.match(TC_PREFIX_RE);
  return m ? m[1].toUpperCase().replace("TC", "TC-").replace("--", "-") : null;
}

function walkSpecs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkSpecs(full));
    else if (SPEC_RE.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Discover generated tests by convention, no manifest:
 *   tests/gen/<project>/<feature>.spec.ts  with  test('TC-xx: ...') titles.
 * `feature` is the spec path relative to the project's specs dir, minus `.spec.ts`.
 */
export function discoverTests(specsDir: string): DiscoveredTest[] {
  const tests: DiscoveredTest[] = [];
  for (const specPath of walkSpecs(specsDir)) {
    const specRelPath = relative(specsDir, specPath).split("\\").join("/");
    const feature = specRelPath.replace(SPEC_RE, "");
    const src = readFileSync(specPath, "utf8");
    for (const m of src.matchAll(TEST_CALL_RE)) {
      const title = m[2].trim();
      if (!title) continue;
      tests.push({
        testId: makeTestId(specRelPath, title),
        specPath,
        specRelPath,
        feature,
        tcId: parseTcId(title),
        title,
      });
    }
  }
  return tests;
}

/** Distinct feature names discovered under a specs dir. */
export function discoverFeatures(specsDir: string): string[] {
  return [...new Set(discoverTests(specsDir).map((t) => t.feature))].sort();
}
