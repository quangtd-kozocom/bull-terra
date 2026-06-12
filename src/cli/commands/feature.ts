import { normalizeStartPath } from "../../core/auth.js";
import {
  featureRecordingPath,
  featureRecordingsDir,
  projectSpecsDir,
} from "../../core/paths.js";
import { join } from "node:path";
import { c, CliError, openDb, resolvePaths, resolveProject } from "../util.js";

/** `bull-terra feature add <project> <name> --sheet <sheetId>` */
export function featureAdd(
  project: string,
  name: string,
  flags: { sheet?: string; startPath?: string; auth?: boolean },
): void {
  const db = openDb(resolvePaths());
  try {
    const p = resolveProject(db, project);
    const f = db.upsertFeature(p.id, name, flags.sheet ?? null, {
      startPath: normalizeStartPath(flags.startPath),
      requiresAuth: flags.auth,
    });
    console.log(
      `${c.green("✓")} Feature ${c.bold(`${p.name}/${f.name}`)}` +
        (f.sheet_id ? c.dim(`  ← sheet ${f.sheet_id}`) : c.yellow("  (no sheet yet — add with --sheet <id>)")) +
        c.dim(`  start ${f.start_path}`) +
        (f.requires_auth ? c.dim("  auth") : ""),
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
      console.log(
        `  ${c.bold(f.name)}  ` +
          `${f.sheet_id ? c.dim(`sheet ${f.sheet_id}`) : c.yellow("no sheet")}  ` +
          `${c.dim(`start ${f.start_path}`)}  ` +
          `${f.requires_auth ? c.dim("auth") : c.dim("public")}`,
      );
  } finally {
    db.close();
  }
}

export function featureInspect(project: string, name: string, flags: { json?: boolean }): void {
  const paths = resolvePaths();
  const db = openDb(paths);
  try {
    const p = resolveProject(db, project);
    const f = db.getFeature(p.id, name);
    if (!f) throw new CliError(`Project "${p.name}" has no feature "${name}".`);

    const recordings = db.listFeatureRecordings(p.id, f.id);
    const payload = {
      stateRoot: paths.root,
      dbPath: paths.dbPath,
      project: { id: p.id, name: p.name },
      feature: {
        id: f.id,
        name: f.name,
        sheetId: f.sheet_id,
        startPath: f.start_path,
        requiresAuth: f.requires_auth === 1,
      },
      environments: db.listEnvironments(p.id).map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        isDefault: e.is_default === 1,
        secretVars: e.secret_vars,
      })),
      recordings: recordings.map((r) => ({
        id: r.id,
        name: r.name,
        path: r.path,
        createdAt: r.created_at,
      })),
      paths: {
        recordingsDir: featureRecordingsDir(paths, p.name, f.name),
        baseRecording: featureRecordingPath(paths, p.name, f.name, "base"),
        specFile: join(projectSpecsDir(paths, p.name), `${f.name}.spec.ts`),
      },
      hasBaseRecording: recordings.some((r) => r.name === "base"),
    };

    if (flags.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`${c.bold(`${p.name}/${f.name}`)}  ${f.sheet_id ? c.dim(`sheet ${f.sheet_id}`) : c.yellow("no sheet")}`);
    console.log(c.dim(`  state: ${payload.stateRoot}`));
    console.log(c.dim(`  spec: ${payload.paths.specFile}`));
    console.log(c.dim(`  recordings: ${payload.paths.recordingsDir}`));
    for (const e of payload.environments) {
      console.log(`  ${e.isDefault ? c.cyan("★") : " "} ${e.name}  ${c.cyan(e.url)}`);
    }
    for (const r of payload.recordings) {
      console.log(`  ${r.name === "base" ? c.cyan("base") : r.name}  ${c.dim(r.path)}`);
    }
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
