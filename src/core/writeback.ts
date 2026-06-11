import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTcId } from "./discover.js";
import type { ParsedTestResult, Project } from "./types.js";

export interface WritebackRow {
  tcId: string;
  status: ParsedTestResult["status"];
  lastRun: string; // ISO timestamp
  traceLink: string | null;
}

export interface WritebackPayload {
  project: string;
  sheetId: string | null;
  generatedAt: string;
  rows: WritebackRow[];
}

/**
 * Build the per-test-case payload to write back into the Google Sheet.
 *
 * Per PRD non-goals, the runtime makes NO Google API calls (no in-app keys).
 * Instead we emit a payload file that a Claude Code MCP step (terra-mcp /
 * kozocom-mcp) reads and writes into the sheet, keeping secrets off the app.
 * Only rows linked to a sheet row by a `TC-xx:` title are included.
 */
export function buildWriteback(
  project: Project,
  results: ParsedTestResult[],
  now: string,
): WritebackPayload {
  const rows: WritebackRow[] = [];
  for (const r of results) {
    const tcId = parseTcId(r.title);
    if (!tcId) continue; // not linked to a sheet row — skip
    rows.push({ tcId, status: r.status, lastRun: now, traceLink: r.tracePath });
  }
  return { project: project.name, sheetId: project.sheet_id, generatedAt: now, rows };
}

/** Persist the writeback payload under the project root for the MCP step to consume. */
export function writeWritebackFile(
  projectRoot: string,
  runId: number,
  payload: WritebackPayload,
): string {
  const dir = join(projectRoot, ".bull-terra", "writeback");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `run-${runId}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
