import { describe, expect, it } from "vitest";
import { buildWriteback } from "../src/core/writeback.js";
import type { ParsedTestResult } from "../src/core/types.js";

function r(
  title: string,
  status: ParsedTestResult["status"],
  trace: string | null = null,
): ParsedTestResult {
  return { testId: title, title, feature: "checkout", status, error: null, tracePath: trace, durationMs: 1 };
}

describe("buildWriteback", () => {
  it("includes only rows linked to a sheet row by a TC id, carrying the feature's sheet", () => {
    const featureSheet = new Map([["checkout", "sheet-123"]]);
    const payload = buildWriteback(
      "app-a",
      "stg",
      [
        r("TC-01: linked", "passed", "test-results/t/trace.zip"),
        r("TC-02: also linked", "failed"),
        r("unlinked title with no tc", "passed"),
      ],
      featureSheet,
      "2026-06-10T00:00:00.000Z",
    );
    expect(payload.project).toBe("app-a");
    expect(payload.env).toBe("stg");
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toEqual({
      feature: "checkout",
      sheetId: "sheet-123",
      tcId: "TC-01",
      status: "passed",
      lastRun: "2026-06-10T00:00:00.000Z",
      traceLink: "test-results/t/trace.zip",
    });
    expect(payload.rows[1].tcId).toBe("TC-02");
  });
});
