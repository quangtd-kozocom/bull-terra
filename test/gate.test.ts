import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/core/db.js";
import { evaluateGate } from "../src/core/gate.js";
import type { ParsedTestResult } from "../src/core/types.js";

function result(testId: string, status: ParsedTestResult["status"]): ParsedTestResult {
  return {
    testId,
    title: testId,
    feature: "f",
    status,
    error: status === "passed" ? null : "boom",
    tracePath: null,
    durationMs: 10,
  };
}

describe("evaluateGate", () => {
  let db: Db;
  let projectId: number;

  beforeEach(() => {
    db = new Db(":memory:");
    projectId = db.createProject("app", "https://x").id;
  });

  it("passes when everything is green and promotes baselines", () => {
    const v = evaluateGate(db, projectId, [result("a", "passed"), result("b", "passed")], {
      updateBaselines: true,
    });
    expect(v.exitCode).toBe(0);
    expect(v.passed).toHaveLength(2);
    expect(db.getBaseline(projectId, "a")?.last_known_status).toBe("passed");
  });

  it("flags a REGRESSION when a previously-passing test now fails", () => {
    db.setBaseline(projectId, "a", "passed"); // 'a' was green before
    const v = evaluateGate(db, projectId, [result("a", "failed")]);
    expect(v.regressions.map((r) => r.testId)).toEqual(["a"]);
    expect(v.newFailures).toHaveLength(0);
    expect(v.exitCode).toBe(1);
  });

  it("does NOT fail the gate for a never-passed (new) failure", () => {
    const v = evaluateGate(db, projectId, [result("brand-new", "failed")]);
    expect(v.newFailures.map((r) => r.testId)).toEqual(["brand-new"]);
    expect(v.regressions).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it("quarantines a flaky test so it cannot trip the gate", () => {
    db.setBaseline(projectId, "flaky", "passed");
    // Build a flip-flopping history via runs/results.
    const statuses = ["passed", "failed", "passed", "failed"];
    for (const s of statuses) {
      const run = db.startRun(projectId, "f");
      db.recordResult(run.id, result("flaky", s as ParsedTestResult["status"]));
    }
    const v = evaluateGate(db, projectId, [result("flaky", "failed")]);
    expect(v.quarantined.map((r) => r.testId)).toEqual(["flaky"]);
    expect(v.regressions).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it("ignores skipped tests entirely", () => {
    const v = evaluateGate(db, projectId, [result("s", "skipped")]);
    expect(v.passed).toHaveLength(0);
    expect(v.regressions).toHaveLength(0);
    expect(v.newFailures).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });
});
