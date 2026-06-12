import { existsSync } from "node:fs";
import { authRequirementError, authStateInfo } from "../../core/auth.js";
import { discoverTests } from "../../core/discover.js";
import { projectSpecsDir } from "../../core/paths.js";
import { requirePlaywrightTest } from "../../core/playwright.js";
import { c, openDb, resolveEnvironment, resolvePaths, resolveProject } from "../util.js";

export interface DoctorFlags {
  project?: string;
  env?: string;
}

type CheckStatus = "pass" | "warn" | "fail";

interface Check {
  status: CheckStatus;
  label: string;
  detail: string;
  fix?: string;
}

export async function doctorCommand(flags: DoctorFlags): Promise<void> {
  const paths = resolvePaths();
  const db = openDb(paths);
  const checks: Check[] = [];
  try {
    const project = resolveProject(db, flags.project);
    const env = resolveEnvironment(db, project, flags.env);
    const specsDir = projectSpecsDir(paths, project.name);

    checks.push(
      existsSync(paths.playwrightConfig)
        ? { status: "pass", label: "playwright.config.ts", detail: paths.playwrightConfig }
        : {
            status: "fail",
            label: "playwright.config.ts",
            detail: `missing at ${paths.playwrightConfig}`,
            fix: "Run: bull-terra init",
          },
    );

    try {
      requirePlaywrightTest(paths.root);
      checks.push({ status: "pass", label: "@playwright/test", detail: "resolvable" });
    } catch (error) {
      checks.push({
        status: "fail",
        label: "@playwright/test",
        detail: (error as Error).message,
        fix: "Install @playwright/test where bull-terra runs, or run: bull-terra init",
      });
    }

    const tests = discoverTests(specsDir);
    checks.push(
      tests.length
        ? { status: "pass", label: "generated specs", detail: `${tests.length} tests under ${specsDir}` }
        : {
            status: "warn",
            label: "generated specs",
            detail: `no tests under ${specsDir}`,
            fix: `Generate tests: claude "/gen-tests ${project.name} <feature>"`,
          },
    );

    checks.push(await checkUrl(env.url));

    const authErrors = db
      .listFeatures(project.id)
      .map((feature) => authRequirementError(paths, project, env, feature))
      .filter((message): message is string => !!message);
    if (authErrors.length) {
      checks.push({
        status: "fail",
        label: "auth storageState",
        detail: authErrors[0],
        fix: `Capture auth in the dashboard for ${project.name}/${env.name}, or run an auth recording first.`,
      });
    } else {
      const auth = authStateInfo(paths, project, env);
      checks.push({
        status: auth.exists ? "pass" : "warn",
        label: "auth storageState",
        detail: auth.exists ? auth.relPath : `not found for ${project.name}/${env.name}`,
        fix: auth.exists ? undefined : "Only needed for features marked auth required.",
      });
    }

    console.log(`${c.bold("bull-terra doctor")} ${c.cyan(`${project.name}/${env.name}`)} ${c.dim(env.url)}`);
    for (const check of checks) printCheck(check);
    if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
  } finally {
    db.close();
  }
}

async function checkUrl(url: string): Promise<Check> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal }).catch(() =>
      fetch(url, { method: "GET", signal: controller.signal }),
    );
    clearTimeout(timer);
    if (res.ok || res.status < 500) return { status: "pass", label: "app URL", detail: `${url} -> ${res.status}` };
    return {
      status: "fail",
      label: "app URL",
      detail: `${url} -> ${res.status}`,
      fix: "Start the app or update the environment URL.",
    };
  } catch (error) {
    return {
      status: "fail",
      label: "app URL",
      detail: `${url} unreachable: ${(error as Error).message}`,
      fix: "Start the app or update the environment URL.",
    };
  }
}

function printCheck(check: Check): void {
  const icon =
    check.status === "pass" ? c.green("✓") : check.status === "warn" ? c.yellow("!") : c.red("✘");
  console.log(`  ${icon} ${c.bold(check.label)}  ${check.detail}`);
  if (check.fix) console.log(c.dim(`      fix: ${check.fix}`));
}
