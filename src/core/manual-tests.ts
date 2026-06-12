import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MANUAL_START = "// <bull-terra:manual>";
const MANUAL_END = "// </bull-terra:manual>";

export function normalizeTcId(value: string): string {
  const raw = value.trim().toUpperCase();
  if (!raw) throw new Error("TC id is required");
  if (raw.startsWith("TC-")) return raw;
  if (/^\d+$/.test(raw)) return `TC-${raw.padStart(2, "0")}`;
  return `TC-${raw}`;
}

export function extractCodegenBody(source: string): string {
  const startNeedle = "async ({ page }) => {";
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error("Could not find a codegen test body in this recording");
  const bodyStart = start + startNeedle.length;
  let depth = 1;
  let i = bodyStart;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) break;
  }
  if (depth !== 0) throw new Error("Could not parse the codegen test body in this recording");
  return deindent(source.slice(bodyStart, i).trim());
}

export function appendManualTest(
  specPath: string,
  recordingSource: string,
  tcIdInput: string,
  titleInput: string,
): { tcId: string; title: string } {
  const tcId = normalizeTcId(tcIdInput);
  const title = titleInput.trim();
  if (!title) throw new Error("test title is required");
  const body = extractCodegenBody(recordingSource);
  const testTitle = `${tcId}: ${title}`;
  const testBlock = [
    `test(${JSON.stringify(testTitle)}, async ({ page }) => {`,
    indent(body, "  "),
    `  // TODO: replace this default smoke assertion with one specific to this test case.`,
    `  await expect.soft(page.locator("body"), "default smoke assertion").toBeAttached();`,
    `});`,
  ].join("\n");

  mkdirSync(dirname(specPath), { recursive: true });
  const current = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
  const withImport = ensurePlaywrightImport(current);
  const withManualSection = ensureManualSection(withImport);
  const updated = withManualSection.replace(MANUAL_END, `${testBlock}\n\n${MANUAL_END}`);
  writeFileSync(specPath, updated);
  return { tcId, title: testTitle };
}

// Matches test('...'), test("..."), test(`...`), incl. test.only / test.skip / test.fixme.
const TEST_CALL_RE = /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

/**
 * Remove a single `test(...)` block from a spec file, matched by its title (the
 * same trimmed title surfaced by discovery). Returns true if a block was removed.
 * The whole statement — through its trailing `);` — is excised and the blank
 * lines it left behind are collapsed so the file stays tidy.
 */
export function removeTestFromSpec(specPath: string, title: string): boolean {
  if (!existsSync(specPath)) return false;
  const source = readFileSync(specPath, "utf8");
  const span = findTestSpan(source, title);
  if (!span) return false;
  const before = source.slice(0, span.start).replace(/[ \t]*$/, "");
  const after = source.slice(span.end);
  const merged = `${before}${after}`.replace(/\n{3,}/g, "\n\n");
  writeFileSync(specPath, merged);
  return true;
}

function findTestSpan(source: string, wantTitle: string): { start: number; end: number } | null {
  for (const m of source.matchAll(TEST_CALL_RE)) {
    if (m[2].trim() !== wantTitle) continue;
    const start = m.index ?? -1;
    if (start < 0) continue;
    const parenStart = source.indexOf("(", start);
    if (parenStart < 0) continue;
    const end = scanToStatementEnd(source, parenStart);
    if (end < 0) continue;
    return { start, end };
  }
  return null;
}

/** From the opening `(` of a call, return the index just past the matching `)` and an optional `;`. */
function scanToStatementEnd(source: string, parenStart: number): number {
  let depth = 0;
  let i = parenStart;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      if (nl < 0) return -1;
      i = nl;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close < 0) return -1;
      i = close + 1;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) break;
  }
  if (depth !== 0) return -1;
  let end = i + 1;
  if (source[end] === ";") end++;
  return end;
}

/** Given the index of an opening quote, return the index of the matching closing quote. */
function skipString(source: string, open: number): number {
  const quote = source[open];
  let i = open + 1;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === quote) return i;
    if (quote === "`" && ch === "$" && source[i + 1] === "{") {
      let depth = 1;
      i += 2;
      for (; i < source.length && depth > 0; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") depth--;
      }
      i--;
    }
  }
  return i;
}

function ensureManualSection(source: string): string {
  if (source.includes(MANUAL_START) && source.includes(MANUAL_END)) return source;
  const trimmed = source.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${MANUAL_START}\n${MANUAL_END}\n`;
}

function ensurePlaywrightImport(source: string): string {
  const importRe = /import\s+\{([^}]+)\}\s+from\s+["']@playwright\/test["'];?/;
  const match = source.match(importRe);
  if (!match) return `import { test, expect } from "@playwright/test";\n\n${source}`;
  const names = new Set(match[1].split(",").map((item) => item.trim()).filter(Boolean));
  names.add("test");
  names.add("expect");
  return source.replace(match[0], `import { ${[...names].join(", ")} } from "@playwright/test";`);
}

function deindent(source: string): string {
  const lines = source.split(/\r?\n/);
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(min)).join("\n");
}

function indent(source: string, prefix: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}
