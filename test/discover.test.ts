import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { discoverFeatures, discoverTests, makeTestId, parseTcId } from "../src/core/discover.js";

describe("parseTcId", () => {
  it("parses TC ids with various separators", () => {
    expect(parseTcId("TC-01: does a thing")).toBe("TC-01");
    expect(parseTcId("TC02 - something")).toBe("TC-02");
    expect(parseTcId("tc-3. lowercase")).toBe("TC-3");
  });
  it("returns null when there is no TC prefix", () => {
    expect(parseTcId("just a title")).toBeNull();
    expect(parseTcId("about TC-01 in the middle")).toBeNull();
  });
});

describe("makeTestId", () => {
  it("joins normalized spec path and title", () => {
    expect(makeTestId("app-a/checkout.spec.ts", "TC-01: x")).toBe(
      "app-a/checkout.spec.ts>TC-01: x",
    );
  });
});

describe("discoverTests", () => {
  const dir = mkdtempSync(join(tmpdir(), "bt-discover-"));
  const specsDir = join(dir, "tests", "gen");
  const featureDir = join(specsDir, "app-a");
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(
    join(featureDir, "checkout.spec.ts"),
    `import { test, expect } from '@playwright/test';
test('TC-01: guest checkout works', async ({ page }) => { await page.goto('/'); });
test("TC-02: saved card works", async ({ page }) => {});
test.skip('TC-03: skipped flow', async () => {});
test('no tc id here', async () => {});
`,
  );
  // A non-spec file must be ignored.
  writeFileSync(join(featureDir, "helpers.ts"), `export async function login() {}`);

  afterAll(() => {});

  it("finds every test() call including .skip and bare titles", () => {
    const tests = discoverTests(specsDir);
    expect(tests).toHaveLength(4);
    const titles = tests.map((t) => t.title);
    expect(titles).toContain("TC-01: guest checkout works");
    expect(titles).toContain("TC-02: saved card works");
    expect(titles).toContain("TC-03: skipped flow");
    expect(titles).toContain("no tc id here");
  });

  it("assigns feature from the spec path and parses tc ids", () => {
    const t = discoverTests(specsDir).find((x) => x.title.startsWith("TC-01"))!;
    expect(t.feature).toBe("app-a/checkout");
    expect(t.tcId).toBe("TC-01");
    expect(t.specRelPath).toBe("app-a/checkout.spec.ts");
    expect(t.testId).toBe("app-a/checkout.spec.ts>TC-01: guest checkout works");
  });

  it("lists distinct features", () => {
    expect(discoverFeatures(specsDir)).toEqual(["app-a/checkout"]);
  });

  it("returns [] for a missing dir", () => {
    expect(discoverTests(join(dir, "nope"))).toEqual([]);
  });
});
