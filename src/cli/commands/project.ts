import { c, openDb, resolvePaths } from "../util.js";

export function projectAdd(name: string, url: string, opts: { sheet?: string }): void {
  const db = openDb(resolvePaths());
  try {
    const p = db.upsertProject(name, url, opts.sheet ?? null);
    console.log(
      `${c.green("✓")} Registered project ${c.bold(p.name)} → ${c.cyan(p.url)}` +
        (p.sheet_id ? c.dim(`  (sheet ${p.sheet_id})`) : ""),
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
      console.log(c.dim("No projects yet. Add one: bull-terra project add <name> <url>"));
      return;
    }
    for (const p of projects) {
      const recs = db.listRecordings(p.id).length;
      console.log(
        `  ${c.bold(p.name)}  ${c.cyan(p.url)}  ` +
          c.dim(`${recs} recording(s)${p.sheet_id ? `, sheet ${p.sheet_id}` : ""}`),
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
