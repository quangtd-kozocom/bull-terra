import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendManualTest,
  extractCodegenBody,
  normalizeTcId,
  removeTestFromSpec,
} from "../src/core/manual-tests.js";

const RECORDING = `import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("https://app.example.com/checkout");
  await page.getByRole("button", { name: "Pay" }).click();
});
`;

describe("normalizeTcId", () => {
  it("keeps an already-prefixed id", () => {
    expect(normalizeTcId("TC-01")).toBe("TC-01");
    expect(normalizeTcId("tc-07")).toBe("TC-07");
  });

  it("pads and prefixes a bare number", () => {
    expect(normalizeTcId("1")).toBe("TC-01");
    expect(normalizeTcId("07")).toBe("TC-07");
  });

  it("prefixes an arbitrary id like M01", () => {
    expect(normalizeTcId("M01")).toBe("TC-M01");
    expect(normalizeTcId("m1")).toBe("TC-M1");
  });

  it("rejects an empty id", () => {
    expect(() => normalizeTcId("   ")).toThrow(/required/);
  });
});

describe("extractCodegenBody", () => {
  it("extracts the first test body with balanced braces", () => {
    const body = extractCodegenBody(RECORDING);
    expect(body).toContain('await page.goto("https://app.example.com/checkout");');
    expect(body).toContain('getByRole("button", { name: "Pay" })');
    // The nested object braces must not terminate the body early.
    expect(body.trim().endsWith(".click();")).toBe(true);
  });

  it("throws when there is no codegen body", () => {
    expect(() => extractCodegenBody("export const x = 1;")).toThrow(/codegen test body/);
  });
});

describe("appendManualTest", () => {
  let dir: string;
  let specPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-manual-"));
    specPath = join(dir, "checkout.spec.ts");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates a manual section with a passing default smoke assertion", () => {
    const { tcId, title } = appendManualTest(specPath, RECORDING, "M01", "user can checkout");
    expect(tcId).toBe("TC-M01");
    expect(title).toBe("TC-M01: user can checkout");

    const out = readFileSync(specPath, "utf8");
    expect(out).toContain("// <bull-terra:manual>");
    expect(out).toContain("// </bull-terra:manual>");
    expect(out).toContain('test("TC-M01: user can checkout", async ({ page }) => {');
    expect(out).toContain("// TODO: replace this default smoke assertion");
    expect(out).toContain('expect.soft(page.locator("body"), "default smoke assertion").toBeAttached()');
    expect(out).toContain('import { test, expect } from "@playwright/test";');
  });

  it("appends into the existing manual section without touching the AI section", () => {
    const existing = `import { test, expect } from "@playwright/test";

// <bull-terra:ai-generated>
test("TC-01: generated", async ({ page }) => {
  await page.goto("/");
});
// </bull-terra:ai-generated>

// <bull-terra:manual>
// </bull-terra:manual>
`;
    writeFileSync(specPath, existing);
    appendManualTest(specPath, RECORDING, "M02", "second manual");

    const out = readFileSync(specPath, "utf8");
    // AI section is preserved verbatim.
    expect(out).toContain('test("TC-01: generated", async ({ page }) => {');
    // New manual test landed inside the manual markers.
    const manualSection = out.slice(out.indexOf("// <bull-terra:manual>"));
    expect(manualSection).toContain('test("TC-M02: second manual"');
    // Still a single import line.
    expect(out.match(/from "@playwright\/test"/g)?.length).toBe(1);
  });
});

describe("removeTestFromSpec", () => {
  let dir: string;
  let specPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bt-remove-"));
    specPath = join(dir, "checkout.spec.ts");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const SPEC = `import { test, expect } from "@playwright/test";

test("TC-01: first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pay )" }).click();
});

test("TC-02: second", async ({ page }) => {
  await page.goto("/two");
});
`;

  it("removes only the matching test, leaving the rest intact", () => {
    writeFileSync(specPath, SPEC);
    expect(removeTestFromSpec(specPath, "TC-01: first")).toBe(true);

    const out = readFileSync(specPath, "utf8");
    expect(out).not.toContain('test("TC-01: first"');
    expect(out).toContain('test("TC-02: second"');
    // The import line survives, and no triple blank lines are left behind.
    expect(out).toContain('import { test, expect } from "@playwright/test";');
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("does not stop early on braces or parens inside strings", () => {
    writeFileSync(specPath, SPEC);
    removeTestFromSpec(specPath, "TC-01: first");
    const out = readFileSync(specPath, "utf8");
    // The `Pay )` string in TC-01 must not have terminated the call early,
    // which would have left a dangling `}).click();` behind.
    expect(out).not.toContain(".click()");
  });

  it("returns false when no test matches", () => {
    writeFileSync(specPath, SPEC);
    expect(removeTestFromSpec(specPath, "TC-99: missing")).toBe(false);
    expect(readFileSync(specPath, "utf8")).toBe(SPEC);
  });

  it("returns false when the spec file does not exist", () => {
    expect(removeTestFromSpec(specPath, "TC-01: first")).toBe(false);
  });
});
