import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { makeTestId } from "./discover.js";
import { resolvePlaywrightCli } from "./playwright.js";
import type { ParsedTestResult, RunnerEvent, TestStatus } from "./types.js";

export interface RunOptions {
  projectRoot: string;
  specsDir: string;
  /** Feature names (relative spec paths minus .spec.ts) to run, or undefined for all. */
  features?: string[];
  /** Per-event callback for live SSE streaming. */
  onEvent?: (e: RunnerEvent) => void;
  signal?: AbortSignal;
  /** Extra env vars injected into the Playwright process (BASE_URL, creds, storageState…). */
  extraEnv?: Record<string, string | undefined>;
}

export interface RunOutcome {
  results: ParsedTestResult[];
  /** Playwright exit code (0 = all passed). */
  exitCode: number;
  /** True if the run was aborted via the signal. */
  aborted: boolean;
}

// Parses `list`-reporter lines for live green/red ticks, e.g.
//   "  ✓  1 [chromium] › path.spec.ts:5:1 › TC-01: title (1.2s)"
const LIST_LINE_RE = /^\s*(✓|✔|✘|✗|×|-)\s+\d+\s+.*?›\s*(.+?)(?:\s+\(\d+(?:\.\d+)?m?s\))?\s*$/;

function symbolToStatus(sym: string): TestStatus {
  if (sym === "✓" || sym === "✔") return "passed";
  if (sym === "-") return "skipped";
  return "failed";
}

/**
 * Run generated specs through Playwright, streaming live events and returning
 * parsed per-test results from the JSON reporter.
 */
export function runSpecs(opts: RunOptions): Promise<RunOutcome> {
  const { projectRoot, specsDir, features, onEvent, signal, extraEnv } = opts;
  const jsonDir = mkdtempSync(join(tmpdir(), "bull-terra-"));
  const jsonPath = join(jsonDir, "report.json");

  const cli = resolvePlaywrightCli(projectRoot);
  const args = [...cli.prefix, "test", "--reporter=list,json"];
  if (features && features.length > 0) {
    // Map each feature to its spec file; Playwright treats positional args as path filters.
    for (const f of features) args.push(join(specsDir, `${f}.spec.ts`));
  }

  return new Promise<RunOutcome>((resolvePromise) => {
    let child: ChildProcess;
    let aborted = false;
    let stderrBuf = "";

    const onAbort = () => {
      aborted = true;
      child?.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child = spawn(cli.command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...extraEnv,
        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath,
        FORCE_COLOR: "0",
      },
      shell: process.platform === "win32",
    });

    const pipeLines = (chunk: Buffer, stream: "stdout" | "stderr") => {
      const text = chunk.toString();
      if (stream === "stderr") stderrBuf += text;
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        onEvent?.({ type: stream, line } as RunnerEvent);
        const m = line.match(LIST_LINE_RE);
        if (m) {
          const status = symbolToStatus(m[1]);
          onEvent?.({ type: "test-end", title: m[2].trim(), status, durationMs: 0 });
        }
      }
    };

    child.stdout?.on("data", (c: Buffer) => pipeLines(c, "stdout"));
    child.stderr?.on("data", (c: Buffer) => pipeLines(c, "stderr"));

    child.on("error", (err) => {
      onEvent?.({ type: "stderr", line: `Failed to start Playwright: ${err.message}` });
      signal?.removeEventListener("abort", onAbort);
      resolvePromise({ results: [], exitCode: 1, aborted });
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      let results: ParsedTestResult[] = [];
      try {
        results = parseJsonReport(readFileSync(jsonPath, "utf8"), specsDir, projectRoot);
      } catch (err) {
        if (!aborted)
          onEvent?.({
            type: "stderr",
            line: `Could not parse JSON report: ${(err as Error).message}. ${stderrBuf.slice(-500)}`,
          });
      } finally {
        rmSync(jsonDir, { recursive: true, force: true });
      }
      resolvePromise({ results, exitCode: code ?? 1, aborted });
    });
  });
}

interface PwAttachment {
  name: string;
  path?: string;
  contentType?: string;
}
interface PwResult {
  status: TestStatus;
  duration: number;
  error?: { message?: string };
  errors?: { message?: string }[];
  attachments?: PwAttachment[];
}
interface PwTest {
  status?: string;
  results: PwResult[];
}
interface PwSpec {
  title: string;
  file?: string;
  tests: PwTest[];
}
interface PwSuite {
  file?: string;
  title?: string;
  suites?: PwSuite[];
  specs?: PwSpec[];
}
interface PwReport {
  config?: { rootDir?: string };
  suites?: PwSuite[];
}

/** Flatten Playwright's nested JSON report into per-test results with stable ids. */
export function parseJsonReport(
  raw: string,
  specsDir: string,
  projectRoot: string,
): ParsedTestResult[] {
  const report = JSON.parse(raw) as PwReport;
  const out: ParsedTestResult[] = [];
  // Playwright reports `file` relative to config.rootDir (its testDir), not the
  // project root. Resolve against rootDir so test ids match discovery exactly.
  const baseDir = report.config?.rootDir ?? projectRoot;

  const visit = (suite: PwSuite, inheritedFile?: string) => {
    const file = suite.file ?? inheritedFile;
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file ?? file ?? "";
      const abs = isAbsolute(specFile) ? specFile : resolve(baseDir, specFile);
      const specRelPath = relative(specsDir, abs).split("\\").join("/");
      const feature = specRelPath.replace(/\.spec\.ts$/, "");
      // Last attempt wins (matches Playwright's own pass/fail decision after retries).
      const last = spec.tests.at(-1)?.results.at(-1);
      const status = (last?.status ?? "failed") as TestStatus;
      const errMsg =
        last?.error?.message ?? last?.errors?.map((e) => e.message).filter(Boolean).join("\n") ?? null;
      const trace =
        last?.attachments?.find((a) => a.name === "trace")?.path ??
        last?.attachments?.find((a) => a.name === "screenshot")?.path ??
        null;
      out.push({
        testId: makeTestId(specRelPath, spec.title),
        title: spec.title,
        feature,
        status,
        error: errMsg ? stripAnsi(errMsg) : null,
        tracePath: trace ? relative(projectRoot, trace).split("\\").join("/") : null,
        durationMs: Math.round(last?.duration ?? 0),
      });
    }
    for (const sub of suite.suites ?? []) visit(sub, file);
  };

  for (const suite of report.suites ?? []) visit(suite);
  return out;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
