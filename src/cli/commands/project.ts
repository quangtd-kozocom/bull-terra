import { c, openDb, resolvePaths } from "../util.js";

export function projectAdd(name: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = db.upsertProject(name);
    console.log(
      `${c.green("✓")} Registered project ${c.bold(p.name)}.\n` +
        c.dim(`  Next: bull-terra env add ${p.name} <env> <url>  ·  bull-terra feature add ${p.name} <feature> --sheet <id>`),
    );
  } finally {
    db.close();
  }
}

export function projectList(): void {
  const db = openDb(resolvePaths());
  try {
    const projects = db.listProjects();
    if (projects.length === 0) {
      console.log(c.dim("No projects yet. Add one: bull-terra project add <name>"));
      return;
    }
    for (const p of projects) {
      const envs = db.listEnvironments(p.id);
      const feats = db.listFeatures(p.id);
      const recs = db.listRecordings(p.id).length;
      console.log(
        `  ${c.bold(p.name)}  ` +
          c.dim(`${envs.length} env(s), ${feats.length} feature(s), ${recs} recording(s)`),
      );
      for (const e of envs)
        console.log(
          `      ${e.is_default ? c.cyan("★") : " "} ${e.name}  ${c.dim(e.url)}` +
            (e.user_var ? c.dim(`  [${e.user_var}/${e.pass_var}]`) : ""),
        );
    }
  } finally {
    db.close();
  }
}

export function projectRemove(name: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = db.getProjectByName(name);
    if (!p) {
      console.log(c.yellow(`No project named "${name}".`));
      return;
    }
    db.deleteProject(p.id);
    console.log(`${c.green("✓")} Removed project ${c.bold(name)} (specs/recordings left on disk).`);
  } finally {
    db.close();
  }
}
