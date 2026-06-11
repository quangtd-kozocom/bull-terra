import { c, openDb, resolvePaths, resolveProject } from "../util.js";

export interface EnvAddFlags {
  project?: string;
  default?: boolean;
  userVar?: string;
  passVar?: string;
}

/** `bull-terra env add <project> <name> <url> [--default --user-var X --pass-var Y]` */
export function envAdd(project: string, name: string, url: string, flags: EnvAddFlags): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    const env = db.upsertEnvironment(p.id, name, url, {
      userVar: flags.userVar ?? null,
      passVar: flags.passVar ?? null,
      isDefault: flags.default,
    });
    console.log(
      `${c.green("✓")} ${env.is_default ? c.cyan("★ ") : ""}${c.bold(`${p.name}/${env.name}`)} → ${c.cyan(env.url)}` +
        (env.user_var ? c.dim(`  creds from $${env.user_var} / $${env.pass_var}`) : c.dim("  (unauthenticated)")),
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
    for (const e of envs)
      console.log(
        `  ${e.is_default ? c.cyan("★") : " "} ${c.bold(e.name)}  ${c.cyan(e.url)}` +
          (e.user_var ? c.dim(`  [${e.user_var}/${e.pass_var}]`) : ""),
      );
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
