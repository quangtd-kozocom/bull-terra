import { reactive } from "vue";
import { streamRun } from "../api";
import type { GateVerdict, RunEvent } from "../types";

export interface RunState {
  running: boolean;
  feature: string | undefined;
  runId: number | null;
  projectName: string | null;
  /** live status keyed by test title */
  liveStatus: Record<string, string>;
  /** the title currently executing (for the pulse indicator) */
  active: string | null;
  log: { stream: "stdout" | "stderr"; line: string }[];
  verdict: GateVerdict | null;
  finishedStatus: string | null;
  dispose: (() => void) | null;
}

export function useRun() {
  const state = reactive<RunState>({
    running: false,
    feature: undefined,
    runId: null,
    projectName: null,
    liveStatus: {},
    active: null,
    log: [],
    verdict: null,
    finishedStatus: null,
    dispose: null,
  });

  function start(
    projectName: string,
    feature: string | undefined,
    env: string | undefined,
    knownTitles: string[],
    onEnd?: () => void,
    videoTestIds: string[] = [],
    testTitles: string[] = [],
  ) {
    if (state.running) return;
    state.running = true;
    state.projectName = projectName;
    state.feature = feature;
    state.runId = null;
    state.liveStatus = Object.fromEntries(knownTitles.map((t) => [t, "queued"]));
    state.active = null;
    state.log = [];
    state.verdict = null;
    state.finishedStatus = null;

    state.dispose = streamRun(projectName, feature, env, videoTestIds, testTitles, (e: RunEvent) =>
      handle(e, onEnd),
    );
  }

  function handle(e: RunEvent, onEnd?: () => void) {
    switch (e.type) {
      case "run-start":
        state.runId = e.runId;
        break;
      case "test-begin":
        state.active = e.title;
        state.liveStatus[e.title] = "running";
        break;
      case "test-end":
        state.liveStatus[e.title] = e.status;
        if (state.active === e.title) state.active = null;
        break;
      case "stdout":
      case "stderr":
        state.log.push({ stream: e.type, line: e.line });
        if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
        break;
      case "run-end":
        state.verdict = e.verdict;
        state.finishedStatus = e.status;
        state.running = false;
        state.active = null;
        onEnd?.();
        break;
    }
  }

  function stop() {
    state.dispose?.();
    state.running = false;
  }

  function reset(projectName?: string | null) {
    if (state.running) return;
    state.projectName = projectName ?? null;
    state.feature = undefined;
    state.runId = null;
    state.liveStatus = {};
    state.active = null;
    state.log = [];
    state.verdict = null;
    state.finishedStatus = null;
    state.dispose = null;
  }

  return { state, start, stop, reset };
}
