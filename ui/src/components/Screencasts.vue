<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { api } from "../api";
import type { ScreencastView } from "../types";
import { look } from "../lib/status";
import { formatDuration, relativeTime } from "../lib/format";
import { artifactUrl } from "../lib/artifacts";

const props = defineProps<{
  projectName: string;
  env: string | null;
  /** A live run in flight — screencasts reload when it finishes. */
  running: boolean;
}>();

const emit = defineEmits<{
  (e: "error", error: unknown): void;
}>();

const confirm = useConfirm();
const screencasts = shallowRef<ScreencastView[]>([]);
const loading = shallowRef(false);
const deleting = shallowRef<string | null>(null);
const openRunIds = shallowRef(new Set<number>());
const groupedScreencasts = computed(() => {
  const groups = new Map<number, ScreencastView[]>();
  for (const cast of screencasts.value) {
    groups.set(cast.runId, [...(groups.get(cast.runId) ?? []), cast]);
  }
  return [...groups.entries()]
    .map(([runId, casts]) => ({
      runId,
      at: casts[0]?.at ?? "",
      featureLabel: [...new Set(casts.map((cast) => cast.feature ?? "all features"))].join(", "),
      casts,
    }))
    .sort((a, b) => b.runId - a.runId);
});

function syncOpenGroups(casts: ScreencastView[]) {
  const existingRunIds = new Set(screencasts.value.map((cast) => cast.runId));
  const next = new Set(openRunIds.value);
  for (const cast of casts) {
    if (!existingRunIds.has(cast.runId)) next.add(cast.runId);
  }
  openRunIds.value = next;
}

function toggleRun(runId: number) {
  const next = new Set(openRunIds.value);
  if (next.has(runId)) next.delete(runId);
  else next.add(runId);
  openRunIds.value = next;
}

function confirmDeleteRun(runId: number, count: number) {
  confirm.require({
    header: "Delete screencasts",
    message: `Delete ${count} video${count === 1 ? "" : "s"} from run #${runId}? Run results and traces stay in history.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete videos",
    acceptClass: "p-button-danger",
    accept: () => deleteVideos(runId),
  });
}

function confirmDeleteOne(cast: ScreencastView) {
  confirm.require({
    header: "Delete screencast",
    message: `Delete video for "${cast.title}" from run #${cast.runId}?`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete video",
    acceptClass: "p-button-danger",
    accept: () => deleteVideos(cast.runId, cast.testId),
  });
}

async function deleteVideos(runId: number, testId?: string) {
  const key = testId ? `${runId}:${testId}` : `${runId}:all`;
  deleting.value = key;
  try {
    await api.deleteScreencastVideos(props.projectName, runId, testId);
    await load();
  } catch (error) {
    emit("error", error);
  } finally {
    deleting.value = null;
  }
}

async function load() {
  loading.value = true;
  try {
    const next = await api.listScreencasts(props.projectName, props.env ?? undefined);
    syncOpenGroups(next);
    screencasts.value = next;
  } catch (error) {
    emit("error", error);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.projectName, props.env] as const, load, { immediate: true });
// A finished run may have produced fresh videos — pull them in.
watch(
  () => props.running,
  (running, was) => {
    if (was && !running) load();
  },
);
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between gap-3">
      <span class="label text-ink-3">screencasts{{ env ? ` · ${env}` : "" }}</span>
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

    <div v-if="screencasts.length" class="grid gap-3">
      <section
        v-for="group in groupedScreencasts"
        :key="group.runId"
        class="overflow-hidden rounded-md border border-line bg-card"
      >
        <div class="flex items-center gap-2 px-4 py-3 transition hover:bg-card-2">
          <button
            class="flex min-w-0 flex-1 items-center gap-3 text-left"
            :aria-expanded="openRunIds.has(group.runId)"
            @click="toggleRun(group.runId)"
          >
            <i
              class="pi pi-chevron-right text-xs text-ink-3 transition-transform"
              :class="openRunIds.has(group.runId) ? 'rotate-90' : ''"
            />
            <span class="tnum font-display text-sm font-bold text-ink">run #{{ group.runId }}</span>
            <span class="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
              {{ group.featureLabel }}
            </span>
            <span class="tnum font-mono text-[11px] text-ink-3">{{ group.casts.length }} videos</span>
            <span class="ml-auto min-w-0 truncate font-mono text-[11px] text-ink-3">
              {{ relativeTime(group.at) }}
            </span>
          </button>
          <Button
            icon="pi pi-trash"
            label="Delete all"
            size="small"
            severity="danger"
            text
            :loading="deleting === `${group.runId}:all`"
            :disabled="deleting !== null"
            @click="confirmDeleteRun(group.runId, group.casts.length)"
          />
        </div>

        <div
          v-if="openRunIds.has(group.runId)"
          class="grid gap-3 border-t border-line bg-sunken p-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <div
            v-for="cast in group.casts"
            :key="`${cast.runId}:${cast.testId}`"
            class="rise overflow-hidden rounded-md border border-line bg-card"
          >
            <video
              :src="artifactUrl(cast.videoPath)"
              controls
              preload="metadata"
              class="aspect-video w-full bg-black"
            />
            <div class="px-3 py-2.5">
              <div class="flex items-center gap-2">
                <span
                  class="grid h-4 w-4 shrink-0 place-items-center text-xs"
                  :style="{ color: look(cast.status).color }"
                >
                  {{ look(cast.status).glyph }}
                </span>
                <span class="min-w-0 flex-1 truncate text-sm text-ink" :title="cast.title">
                  {{ cast.title }}
                </span>
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  size="small"
                  severity="danger"
                  :loading="deleting === `${cast.runId}:${cast.testId}`"
                  :disabled="deleting !== null"
                  :aria-label="`Delete video for ${cast.title}`"
                  v-tooltip.top="'Delete video'"
                  @click="confirmDeleteOne(cast)"
                />
              </div>
              <div class="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-ink-3">
                <span class="rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-ink-2">
                  {{ cast.feature ?? "all features" }}
                </span>
                <span class="min-w-0 flex-1 truncate">{{ relativeTime(cast.at) }}</span>
                <span class="tnum shrink-0">{{ formatDuration(cast.durationMs) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div
      v-else-if="!loading"
      class="rounded-md border border-dashed border-line-strong px-6 py-12 text-center"
    >
      <p class="font-display text-lg font-bold text-ink">No screencasts yet</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Tick <span class="font-mono text-[12px]">record video</span> on the Run tab and every test
        of the next run is captured here as a watchable screencast.
      </p>
    </div>
  </div>
</template>
