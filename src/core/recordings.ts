import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export function backupExistingRecording(path: string): string | null {
  if (!existsSync(path)) return null;
  const parsed = parse(path);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupPath = join(parsed.dir, ".history", `${parsed.name}-${stamp}${parsed.ext}`);
  mkdirSync(dirname(backupPath), { recursive: true });
  renameSync(path, backupPath);
  return backupPath;
}
