import { describe, expect, it } from "vitest";
import { parseJsonReport } from "../src/core/runner.js";

// Mirrors how Playwright actually emits the JSON report: `file` is relative to
// config.rootDir (the testDir), and specsDir is the per-project subdir.
const PROJECT_ROOT = "/proj";
const ROOT_DIR = "/proj/tests/gen"; // Playwright testDir
const SPECS_DIR = "/proj/tests/gen/app-a"; // bull-terra project specs dir

const report = {
  config: { rootDir: ROOT_DIR },
  suites: [
    {
      title: "checkout.spec.ts",
      file: "app-a/checkout.spec.ts",
      specs: [
        {
          title: "TC-01: guest checkout works",
          file: "app-a/checkout.spec.ts",
          tests: [{ results: [{ status: "passed", duration: 1234, attachments: [] }] }],
        },
        {
          title: "TC-02: saved card works",
          file: "app-a/checkout.spec.ts",
          tests: [
            {
              results: [
                {
                  status: "failed",
                  duration: 2000,
                  error: { message: "[31mExpected true[0m" },
                  attachments: [
                    { name: "trace", path: "/proj/test-results/app-a-checkout/trace.zip" },
                    { name: "video", path: "/proj/recordings/app-a/.runs/run-7/checkout/video.webm" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      // Nested describe-style suite to exercise recursion + file inheritance.
      suites: [
        {
          title: "nested",
          specs: [
            {
              title: "TC-03: nested case",
              tests: [{ results: [{ status: "skipped", duration: 0, attachments: [] }] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("parseJsonReport", () => {
  const results = parseJsonReport(JSON.stringify(report), SPECS_DIR, PROJECT_ROOT);

  it("flattens nested suites into one result per spec", () => {
    expect(results).toHaveLength(3);
  });

  it("computes stable test ids relative to the specs dir (via config.rootDir)", () => {
    expect(results[0].testId).toBe("checkout.spec.ts>TC-01: guest checkout works");
    expect(results[0].feature).toBe("checkout");
  });

  it("captures status, duration and strips ANSI from errors", () => {
    const failed = results.find((r) => r.title.startsWith("TC-02"))!;
    expect(failed.status).toBe("failed");
    expect(failed.durationMs).toBe(2000);
    expect(failed.error).toBe("Expected true");
  });

  it("records trace path relative to the project root", () => {
    const failed = results.find((r) => r.title.startsWith("TC-02"))!;
    expect(failed.tracePath).toBe("test-results/app-a-checkout/trace.zip");
  });

  it("records the video attachment relative to the project root", () => {
    const failed = results.find((r) => r.title.startsWith("TC-02"))!;
    expect(failed.videoPath).toBe("recordings/app-a/.runs/run-7/checkout/video.webm");
    expect(results[0].videoPath).toBeNull(); // no video attachment → null
  });

  it("inherits the file for nested suites without their own file", () => {
    const nested = results.find((r) => r.title.startsWith("TC-03"))!;
    expect(nested.feature).toBe("checkout");
    expect(nested.status).toBe("skipped");
  });
});
