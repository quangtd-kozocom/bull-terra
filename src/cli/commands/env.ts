import { normalizeKey, parseVarFlag } from "../../core/secret-vars.js";
import type { Environment } from "../../core/types.js";
import { c, CliError, openDb, resolvePaths, resolveProject } from "../util.js";

export interface EnvAddFlags {
  project?: string;
  default?: boolean;
  /** Sugar: --user-var X === --var USER=X. */
  userVar?: string;
  /** Sugar: --pass-var X === --var PASS=X. */
  passVar?: string;
  /** Repeatable --var KEY=ENV_VAR_NAME specs. */
  var?: string[];
  /** Repeatable --unset KEY to drop a previously-registered var. */
  unset?: string[];
}

/** One-line "vars: USER=$APP_A_STG_USER, …" (or the unauthenticated note). */
function describeVars(env: Environment): string {
  const keys = Object.keys(env.secret_vars);
  if (!keys.length) return c.dim("  (unauthenticated)");
  return c.dim(`  vars: ${keys.map((k) => `${k}=$${env.secret_vars[k]}`).join(", ")}`);
}

/**
 * `bull-terra env add <project> <name> <url>
 *    [--default] [--user-var X] [--pass-var Y] [--var KEY=Z]… [--unset KEY]…`
 */
export function envAdd(project: string, name: string, url: string, flags: EnvAddFlags): void {
  const db = openDb(resolvePaths());
  try {
    const secretVars: Record<string, string> = {};
    let unset: string[] = [];
    try {
      if (flags.userVar) secretVars.USER = flags.userVar;
      if (flags.passVar) secretVars.PASS = flags.passVar;
      for (const spec of flags.var ?? []) {
        const [key, varName] = parseVarFlag(spec);
        secretVars[key] = varName;
      }
      unset = (flags.unset ?? []).map(normalizeKey);
    } catch (e) {
      throw new CliError((e as Error).message);
    }

    const p = resolveProject(db, project);
    const env = db.upsertEnvironment(p.id, name, url, {
      secretVars,
      unset,
      isDefault: flags.default,
    });
    console.log(
      `${c.green("✓")} ${env.is_default ? c.cyan("★ ") : ""}${c.bold(`${p.name}/${env.name}`)} → ${c.cyan(env.url)}` +
        describeVars(env),
    );
  } finally {
    db.close();
  }
}

export function envList(project: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    const envs = db.listEnvironments(p.id);
    if (!envs.length) {
      console.log(c.dim(`No environments for ${p.name}. Add one: bull-terra env add ${p.name} <name> <url>`));
      return;
    }
    for (const e of envs) {
      const keys = Object.keys(e.secret_vars);
      console.log(
        `  ${e.is_default ? c.cyan("★") : " "} ${c.bold(e.name)}  ${c.cyan(e.url)}` +
          (keys.length ? c.dim(`  [${keys.join(", ")}]`) : ""),
      );
    }
  } finally {
    db.close();
  }
}

export function envDefault(project: string, name: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    const env = db.getEnvironment(p.id, name);
    if (!env) {
      console.log(c.yellow(`No environment "${name}" in ${p.name}.`));
      return;
    }
    db.setDefaultEnvironment(p.id, env.id);
    console.log(`${c.green("✓")} ${c.bold(`${p.name}/${name}`)} is now the default environment.`);
  } finally {
    db.close();
  }
}

export function envRemove(project: string, name: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    if (db.deleteEnvironment(p.id, name))
      console.log(`${c.green("✓")} Removed environment ${c.bold(`${p.name}/${name}`)}.`);
    else console.log(c.yellow(`No environment "${name}" in ${p.name}.`));
  } finally {
    db.close();
  }
}
