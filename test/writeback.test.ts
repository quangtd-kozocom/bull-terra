import { describe, expect, it } from "vitest";
import { buildWriteback } from "../src/core/writeback.js";
import type { ParsedTestResult, Project } from "../src/core/types.js";

const project: Project = {
  id: 1,
  name: "app-a",
  url: "https://x",
  sheet_id: "sheet-123",
  created_at: "now",
};

function r(title: string, status: ParsedTestResult["status"], trace: string | null = null): ParsedTestResult {
  return { testId: title, title, feature: "f", status, error: null, tracePath: trace, durationMs: 1 };
}

describe("buildWriteback", () => {
  it("includes only rows linked to a sheet row by a TC id", () => {
    const payload = buildWriteback(
      project,
      [
        r("TC-01: linked", "passed", "test-results/t/trace.zip"),
        r("TC-02: also linked", "failed"),
        r("unlinked title with no tc", "passed"),
      ],
      "2026-06-10T00:00:00.000Z",
    );
    expect(payload.sheetId).toBe("sheet-123");
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toEqual({
      tcId: "TC-01",
      status: "passed",
      lastRun: "2026-06-10T00:00:00.000Z",
      traceLink: "test-results/t/trace.zip",
    });
    expect(payload.rows[1].tcId).toBe("TC-02");
  });
});
