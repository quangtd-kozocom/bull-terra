<script setup lang="ts">
import { computed } from "vue";
import type { TestHistoryEntry } from "../types";
import { look } from "../lib/status";
import { formatDuration, relativeTime } from "../lib/format";

const props = defineProps<{ history: TestHistoryEntry[] }>();

/** Oldest → newest so the rightmost tick is the latest run. */
const ticks = computed(() =>
  [...props.history].reverse().map((entry) => ({
    ...entry,
    color: look(entry.status).color,
    tip: `${look(entry.status).label} · ${formatDuration(entry.durationMs)} · ${relativeTime(entry.at)}`,
  })),
);
</script>

<template>
  <span class="flex items-end gap-[2px]" aria-label="Recent results, oldest to newest">
    <span
      v-for="(tick, i) in ticks"
      :key="`${tick.runId}-${i}`"
      class="w-[4px] rounded-[1px]"
      :class="tick.status === 'passed' ? 'h-2 opacity-70' : 'h-3'"
      :style="{ backgroundColor: tick.color }"
      v-tooltip.top="tick.tip"
    />
  </span>
</template>
