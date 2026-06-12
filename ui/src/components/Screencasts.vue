<script setup lang="ts">
import { shallowRef, watch } from "vue";
import Button from "primevue/button";
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

const screencasts = shallowRef<ScreencastView[]>([]);
const loading = shallowRef(false);

async function load() {
  loading.value = true;
  try {
    screencasts.value = await api.listScreencasts(props.projectName, props.env ?? undefined);
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

    <div v-if="screencasts.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="cast in screencasts"
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
          </div>
          <div class="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-ink-3">
            <span class="tnum">run #{{ cast.runId }}</span>
            <span class="rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-ink-2">
              {{ cast.feature ?? "all features" }}
            </span>
            <span class="min-w-0 flex-1 truncate">{{ relativeTime(cast.at) }}</span>
            <span class="tnum shrink-0">{{ formatDuration(cast.durationMs) }}</span>
          </div>
        </div>
      </div>
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
