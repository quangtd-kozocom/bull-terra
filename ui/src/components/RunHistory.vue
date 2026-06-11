<script setup lang="ts">
import { ref, shallowRef, watch } from "vue";
import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { api } from "../api";
import type { ArtifactStatsView, RunDetailView, RunSummaryView } from "../types";
import { look } from "../lib/status";
import { formatBytes, formatDuration, relativeTime } from "../lib/format";
import { artifactKind, artifactLabel, artifactUrl } from "../lib/artifacts";

const props = defineProps<{
  projectName: string;
  env: string | null;
  /** A live run in flight — history reloads when it finishes. */
  running: boolean;
}>();

const emit = defineEmits<{
  (e: "trace", path: string): void;
  (e: "error", error: unknown): void;
}>();

const confirm = useConfirm();
const runs = shallowRef<RunSummaryView[]>([]);
const loading = shallowRef(false);
const expanded = ref(new Set<number>());
const details = ref<Record<number, RunDetailView | null>>({});
const artifacts = shallowRef<ArtifactStatsView>({ totalBytes: 0, byRun: {} });
const cleaning = shallowRef(false);

async function load() {
  loading.value = true;
  try {
    [runs.value, artifacts.value] = await Promise.all([
      api.listRuns(props.projectName, props.env ?? undefined),
      api.artifactStats(props.projectName),
    ]);
    expanded.value = new Set();
    details.value = {};
  } catch (error) {
    emit("error", error);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.projectName, props.env] as const, load, { immediate: true });
// When the live run ends, its row (and updated tallies) belong at the top.
watch(
  () => props.running,
  (running, was) => {
    if (was && !running) load();
  },
);

async function toggle(runId: number) {
  const next = new Set(expanded.value);
  if (next.has(runId)) {
    next.delete(runId);
    expanded.value = next;
    return;
  }
  next.add(runId);
  expanded.value = next;
  if (details.value[runId] !== undefined) return;
  details.value = { ...details.value, [runId]: null };
  try {
    const detail = await api.getRun(props.projectName, runId);
    details.value = { ...details.value, [runId]: detail };
  } catch (error) {
    delete details.value[runId];
    expanded.value = new Set([...expanded.value].filter((id) => id !== runId));
    emit("error", error);
  }
}

function confirmDeleteRunArtifacts(runId: number) {
  confirm.require({
    header: "Delete run artifacts",
    message: `Delete the screenshots/videos/traces of run #${runId} (${formatBytes(artifacts.value.byRun[runId] ?? 0)})? The run's results stay in history.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete artifacts",
    acceptClass: "p-button-danger",
    accept: async () => {
      cleaning.value = true;
      try {
        await api.deleteRunArtifacts(props.projectName, runId);
        await load();
      } catch (error) {
        emit("error", error);
      } finally {
        cleaning.value = false;
      }
    },
  });
}

function confirmCleanAll() {
  confirm.require({
    header: "Clear all artifacts",
    message: `Delete ALL run artifacts for ${props.projectName} (${formatBytes(artifacts.value.totalBytes)})? Run history and results are kept — only files and their links are removed.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Clear all",
    acceptClass: "p-button-danger",
    accept: async () => {
      cleaning.value = true;
      try {
        await api.cleanArtifacts(props.projectName, 0);
        await load();
      } catch (error) {
        emit("error", error);
      } finally {
        cleaning.value = false;
      }
    },
  });
}

/** The gate's bucket for one result within its run, from the stored verdict. */
function gateTag(runId: number, testId: string): "regression" | "new" | "flaky" | null {
  const verdict = details.value[runId]?.run.verdict;
  if (!verdict) return null;
  if (verdict.regressions.includes(testId)) return "regression";
  if (verdict.newFailures.includes(testId)) return "new";
  if (verdict.quarantined.includes(testId)) return "flaky";
  return null;
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between gap-3">
      <span class="label text-ink-3">run history{{ env ? ` · ${env}` : "" }}</span>
      <div class="flex items-center gap-2">
        <span
          v-if="artifacts.totalBytes"
          class="tnum font-mono text-[11px] text-ink-3"
          v-tooltip.left="'Disk used by run screenshots, videos and traces'"
        >
          {{ formatBytes(artifacts.totalBytes) }} on disk
        </span>
        <Button
          v-if="artifacts.totalBytes"
          label="Clear artifacts"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          outlined
          :loading="cleaning"
          @click="confirmCleanAll"
        />
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          outlined
          :loading="loading"
          @click="load"
        />
      </div>
    </div>

    <ul v-if="runs.length" class="space-y-2">
      <li v-for="r in runs" :key="r.id" class="rise overflow-hidden rounded-md border border-line bg-card">
        <!-- summary row -->
        <div class="flex items-center gap-1 pr-2">
        <button class="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left" @click="toggle(r.id)">
          <svg
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform"
            :class="expanded.has(r.id) ? 'rotate-90' : ''"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>

          <span
            class="grid h-4 w-4 shrink-0 place-items-center text-xs"
            :class="r.status === 'running' ? 'pulse rounded-full' : ''"
            :style="{ color: look(r.status).color }"
          >
            {{ look(r.status).glyph }}
          </span>

          <span class="tnum shrink-0 font-mono text-[11px] text-ink-3">#{{ r.id }}</span>

          <span class="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
            {{ r.feature ?? "all features" }}
          </span>

          <span
            v-if="r.regressions"
            class="shrink-0 rounded-sm bg-fail/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fail"
            v-tooltip.top="'Tests that were green in the baseline and broke in this run'"
            >{{ r.regressions }} REGRESSION{{ r.regressions > 1 ? "S" : "" }}</span
          >
          <span
            v-if="r.newFailures"
            class="shrink-0 rounded-sm bg-flaky/15 px-1.5 py-0.5 font-mono text-[10px] text-flaky"
            v-tooltip.top="'Failures that never passed before — reported, not gating'"
            >{{ r.newFailures }} new</span
          >
          <span
            v-if="r.quarantined"
            class="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3"
            v-tooltip.top="'Flaky failures quarantined from the gate'"
            >{{ r.quarantined }} flaky</span
          >

          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
            {{ relativeTime(r.started_at) }}
          </span>

          <span class="tnum flex shrink-0 items-center gap-2.5 font-mono text-xs">
            <span :style="{ color: 'var(--color-pass)' }">● {{ r.passed }}</span>
            <span v-if="r.failed" :style="{ color: 'var(--color-fail)' }">▲ {{ r.failed }}</span>
            <span v-if="r.skipped" class="text-ink-3">– {{ r.skipped }}</span>
            <span class="text-ink-3">{{ formatDuration(r.duration_ms) }}</span>
          </span>
        </button>

        <span v-if="artifacts.byRun[r.id]" class="tnum shrink-0 font-mono text-[10px] text-ink-3">
          {{ formatBytes(artifacts.byRun[r.id]) }}
        </span>
        <Button
          v-if="artifacts.byRun[r.id]"
          icon="pi pi-trash"
          text
          rounded
          size="small"
          severity="danger"
          :disabled="cleaning"
          :aria-label="`Delete artifacts of run #${r.id}`"
          v-tooltip.left="'Delete this run\'s screenshots/videos/traces'"
          @click="confirmDeleteRunArtifacts(r.id)"
        />
        </div>

        <!-- detail: per-test results of this run -->
        <div v-if="expanded.has(r.id)" class="border-t border-line bg-sunken">
          <p v-if="!details[r.id]" class="px-4 py-3 text-center font-mono text-[11px] text-ink-3">loading…</p>
          <p
            v-else-if="!details[r.id]!.results.length"
            class="px-4 py-3 text-center font-mono text-[11px] text-ink-3"
          >
            No results recorded — the run {{ r.status === "stopped" ? "was stopped" : "errored" }} before any test
            finished.
          </p>
          <ul v-else>
            <li
              v-for="t in details[r.id]!.results"
              :key="t.testId"
              class="border-b border-line px-4 py-2 text-sm last:border-b-0"
            >
              <div class="flex items-center gap-3">
                <span
                  class="grid h-4 w-4 shrink-0 place-items-center text-xs"
                  :style="{ color: look(t.status).color }"
                >
                  {{ look(t.status).glyph }}
                </span>
                <span class="min-w-0 flex-1 truncate text-ink">{{ t.title }}</span>

                <span
                  v-if="gateTag(r.id, t.testId) === 'regression'"
                  class="shrink-0 rounded-sm bg-fail/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fail"
                  >REGRESSION</span
                >
                <span
                  v-else-if="gateTag(r.id, t.testId) === 'new'"
                  class="shrink-0 rounded-sm bg-flaky/15 px-1.5 py-0.5 font-mono text-[10px] text-flaky"
                  v-tooltip.top="'Never passed before — reported, not gating'"
                  >NEW</span
                >
                <span
                  v-else-if="gateTag(r.id, t.testId) === 'flaky'"
                  class="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3"
                  v-tooltip.top="'Quarantined from the gate as flaky'"
                  >FLAKY</span
                >

                <span class="tnum shrink-0 font-mono text-[11px] text-ink-3">{{ formatDuration(t.durationMs) }}</span>
                <button
                  v-if="t.tracePath && artifactKind(t.tracePath) === 'trace'"
                  class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
                  @click="emit('trace', t.tracePath!)"
                >
                  trace ↗
                </button>
                <a
                  v-else-if="t.tracePath"
                  :href="artifactUrl(t.tracePath)"
                  target="_blank"
                  rel="noreferrer"
                  class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
                >
                  {{ artifactLabel(t.tracePath) }}
                </a>
                <a
                  v-if="t.videoPath"
                  :href="artifactUrl(t.videoPath)"
                  target="_blank"
                  rel="noreferrer"
                  class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
                  v-tooltip.top="'Watch the recorded test steps'"
                >
                  video ↗
                </a>
              </div>
              <pre
                v-if="t.error"
                class="mt-1.5 max-h-40 overflow-auto rounded-sm border border-fail/30 bg-fail/5 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fail"
                >{{ t.error }}</pre
              >
              <a
                v-if="t.tracePath && artifactKind(t.tracePath) === 'image'"
                :href="artifactUrl(t.tracePath)"
                target="_blank"
                rel="noreferrer"
                class="mt-1.5 block w-fit"
                v-tooltip.top="'Failure screenshot — click to open full size'"
              >
                <img
                  :src="artifactUrl(t.tracePath)"
                  alt="Failure screenshot"
                  loading="lazy"
                  class="max-h-56 rounded-sm border border-line"
                />
              </a>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <div
      v-else-if="!loading"
      class="rounded-md border border-dashed border-line-strong px-6 py-12 text-center"
    >
      <p class="font-display text-lg font-bold text-ink">No runs yet</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Run a feature against this environment and every run will be archived here — statuses, durations,
        errors, and traces.
      </p>
    </div>
  </div>
</template>
