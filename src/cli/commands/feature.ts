import { c, openDb, resolvePaths, resolveProject } from "../util.js";

/** `bull-terra feature add <project> <name> --sheet <sheetId>` */
export function featureAdd(project: string, name: string, flags: { sheet?: string }): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    const f = db.upsertFeature(p.id, name, flags.sheet ?? null);
    console.log(
      `${c.green("✓")} Feature ${c.bold(`${p.name}/${f.name}`)}` +
        (f.sheet_id ? c.dim(`  ← sheet ${f.sheet_id}`) : c.yellow("  (no sheet yet — add with --sheet <id>)")),
    );
    console.log(c.dim(`  Generate tests: claude "/gen-tests ${p.name} ${f.name}"`));
  } finally {
    db.close();
  }
}

export function featureList(project: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    const feats = db.listFeatures(p.id);
    if (!feats.length) {
      console.log(c.dim(`No features for ${p.name}. Add one: bull-terra feature add ${p.name} <name> --sheet <id>`));
      return;
    }
    for (const f of feats)
      console.log(`  ${c.bold(f.name)}  ${f.sheet_id ? c.dim(`sheet ${f.sheet_id}`) : c.yellow("no sheet")}`);
  } finally {
    db.close();
  }
}

export function featureRemove(project: string, name: string): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    if (db.deleteFeature(p.id, name))
      console.log(`${c.green("✓")} Removed feature ${c.bold(`${p.name}/${name}`)} (specs left on disk).`);
    else console.log(c.yellow(`No feature "${name}" in ${p.name}.`));
  } finally {
    db.close();
  }
}
