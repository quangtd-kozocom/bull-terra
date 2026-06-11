import type { Db } from "../core/db.js";
import { executeRun } from "../core/engine.js";
import { projectSpecsDir } from "../core/paths.js";
import type { ProjectPaths } from "../core/paths.js";
import type { Environment, Project, RunEvent } from "../core/types.js";

/**
 * v1 assumes one run at a time locally (PRD §12). The manager holds the single
 * active run's AbortController so the dashboard's Stop button can cancel it.
 */
export class RunManager {
  private current: AbortController | null = null;

  get isRunning(): boolean {
    return this.current !== null;
  }

  stop(): boolean {
    if (!this.current) return false;
    this.current.abort();
    return true;
  }

  async run(
    db: Db,
    paths: ProjectPaths,
    project: Project,
    env: Environment,
    features: string[] | undefined,
    onEvent: (e: RunEvent) => void,
    video = false,
  ): Promise<void> {
    if (this.current) {
      onEvent({
        type: "stderr",
        line: "A run is already in progress. Stop it first.",
      } as RunEvent);
      return;
    }
    const controller = new AbortController();
    this.current = controller;
    try {
      await executeRun({
        db,
        project,
        env,
        paths,
        specsDir: projectSpecsDir(paths, project.name),
        features,
        signal: controller.signal,
        onEvent,
        video,
      });
    } finally {
      this.current = null;
    }
  }
}
