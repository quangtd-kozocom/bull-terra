import type { Db } from "./db.js";
import type { GateVerdict, ParsedTestResult } from "./types.js";

/** A test is "passing" for gate/baseline purposes only when it actually passed. */
function isPass(status: string): boolean {
  return status === "passed";
}

/**
 * Flaky heuristic: the test's recent recorded history flips between pass and
 * fail more than `flips` times. Flaky tests are quarantined so they cannot
 * trip the regression gate (PRD §8: keep the gate trustworthy).
 */
function isFlaky(history: string[], flips = 2): boolean {
  let changes = 0;
  for (let i = 1; i < history.length; i++) {
    if (isPass(history[i]) !== isPass(history[i - 1])) changes++;
  }
  return changes >= flips;
}

export interface GateOptions {
  /** When true, update baselines for newly-passing tests after computing the verdict. */
  updateBaselines?: boolean;
}

/**
 * Regression-aware gate (PRD decision #8): exit 1 ONLY when a test that was
 * PASS in the baseline is now FAIL. New/never-passed failures are reported but
 * do not fail the gate ("not built yet" ≠ "I broke it"). Flaky tests are
 * quarantined out of the decision.
 */
export function evaluateGate(
  db: Db,
  projectId: number,
  results: ParsedTestResult[],
  opts: GateOptions = {},
): GateVerdict {
  const regressions: ParsedTestResult[] = [];
  const newFailures: ParsedTestResult[] = [];
  const quarantined: ParsedTestResult[] = [];
  const passed: ParsedTestResult[] = [];

  for (const r of results) {
    if (isPass(r.status)) {
      passed.push(r);
      if (opts.updateBaselines) db.setBaseline(projectId, r.testId, "passed");
      continue;
    }
    if (r.status === "skipped") continue;

    // Failing test. Quarantine if its history says it's flaky.
    const history = db.statusHistory(projectId, r.testId);
    if (history.length >= 4 && isFlaky([r.status, ...history])) {
      quarantined.push(r);
      continue;
    }

    const baseline = db.getBaseline(projectId, r.testId);
    if (baseline?.last_known_status === "passed") {
      regressions.push(r); // was green, now red → real regression
    } else {
      newFailures.push(r); // never passed → work in progress
    }
  }

  return {
    regressions,
    newFailures,
    quarantined,
    passed,
    exitCode: regressions.length > 0 ? 1 : 0,
  };
}
