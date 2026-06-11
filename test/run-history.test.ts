import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/core/db.js";
import { evaluateGate, isFlaky } from "../src/core/gate.js";
import type { ParsedTestResult, TestStatus } from "../src/core/types.js";

function result(testId: string, status: TestStatus, durationMs = 10): ParsedTestResult {
  return {
    testId,
    title: testId,
    feature: "f",
    status,
    error: status === "passed" ? null : "boom",
    tracePath: null,
    durationMs,
  };
}

describe("run history queries", () => {
  let db: Db;
  let projectId: number;
  let envId: number;

  beforeEach(() => {
    db = new Db(":memory:");
    projectId = db.createProject("app").id;
    envId = db.upsertEnvironment(projectId, "stg", "https://stg.x").id;
  });

  /** One finished run recording the given results, returning its id. */
  function run(statusByTest: Record<string, TestStatus>, runStatus: "passed" | "failed" = "passed") {
    const r = db.startRun(projectId, envId, null);
    for (const [testId, status] of Object.entries(statusByTest)) {
      db.recordResult(r.id, result(testId, status));
    }
    db.finishRun(r.id, runStatus);
    return r.id;
  }

  describe("historiesByTest", () => {
    it("returns per-test history newest first, keyed by test id", () => {
      const first = run({ a: "passed", b: "failed" });
      const second = run({ a: "failed" });
      const histories = db.historiesByTest(projectId, envId);

      expect(histories.get("a")?.map((h) => h.status)).toEqual(["failed", "passed"]);
      expect(histories.get("a")?.map((h) => h.runId)).toEqual([second, first]);
      expect(histories.get("b")?.map((h) => h.status)).toEqual(["failed"]);
    });

    it("caps entries per test", () => {
      for (let i = 0; i < 5; i++) run({ a: "passed" });
      expect(db.historiesByTest(projectId, envId, 3).get("a")).toHaveLength(3);
    });

    it("scopes history to the environment", () => {
      const otherEnv = db.upsertEnvironment(projectId, "local", "http://localhost:3000").id;
      run({ a: "passed" });
      expect(db.historiesByTest(projectId, otherEnv).get("a")).toBeUndefined();
    });
  });

  describe("listRunSummaries", () => {
    it("tallies per-run outcomes and totals duration", () => {
      run({ a: "passed", b: "failed", c: "timedOut", d: "skipped" }, "failed");
      const [summary] = db.listRunSummaries(projectId, envId);
      expect(summary).toMatchObject({
        status: "failed",
        passed: 1,
        failed: 2, // failed + timedOut
        skipped: 1,
        duration_ms: 40,
      });
    });

    it("returns newest first and includes runs with no results", () => {
      const first = run({ a: "passed" });
      const empty = db.startRun(projectId, envId, null);
      db.finishRun(empty.id, "error");
      const summaries = db.listRunSummaries(projectId, envId);
      expect(summaries.map((s) => s.id)).toEqual([empty.id, first]);
      expect(summaries[0]).toMatchObject({ status: "error", passed: 0, failed: 0, duration_ms: 0 });
    });
  });

  describe("run verdict persistence", () => {
    it("stores the gate verdict on finish and exposes counts in summaries", () => {
      const r = db.startRun(projectId, envId, null);
      db.recordResult(r.id, result("a", "failed"));
      db.recordResult(r.id, result("b", "failed"));
      db.recordResult(r.id, result("c", "failed"));
      db.finishRun(r.id, "failed", {
        regressions: ["a"],
        newFailures: ["b"],
        quarantined: ["c"],
      });

      expect(db.getRun(r.id)?.verdict).toEqual({
        regressions: ["a"],
        newFailures: ["b"],
        quarantined: ["c"],
      });
      const [summary] = db.listRunSummaries(projectId, envId);
      expect(summary).toMatchObject({ regressions: 1, newFailures: 1, quarantined: 1 });
    });

    it("treats verdict-less (legacy) runs as zero counts", () => {
      run({ a: "failed" }, "failed"); // finishRun without a verdict
      const [summary] = db.listRunSummaries(projectId, envId);
      expect(db.getRun(summary.id)?.verdict).toBeNull();
      expect(summary).toMatchObject({ regressions: 0, newFailures: 0, quarantined: 0 });
    });
  });

  describe("flaky flag parity with the gate", () => {
    it("isFlaky matches what evaluateGate quarantines", () => {
      // Flip-flopping history: P F P F — two flips and more.
      for (const status of ["passed", "failed", "passed", "failed"] as const) {
        run({ a: status }, status === "passed" ? "passed" : "failed");
      }
      const history = db.historiesByTest(projectId, envId).get("a")!;
      const flagged = history.length >= 4 && isFlaky(history.map((h) => h.status));
      const verdict = evaluateGate(db, projectId, envId, [result("a", "failed")]);
      expect(flagged).toBe(true);
      expect(verdict.quarantined.map((r) => r.testId)).toEqual(["a"]);
    });
  });
});
