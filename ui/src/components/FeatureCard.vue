<script setup lang="ts">
import { computed, ref } from "vue";
import type { FeatureView } from "../types";
import { healthColor, isRegression, look } from "../lib/status";

const props = defineProps<{
  feature: FeatureView;
  liveStatus: Record<string, string>;
  running: boolean;
  activeTitle: string | null;
}>();

const emit = defineEmits<{
  (e: "run", feature: string): void;
  (e: "gen", feature: string): void;
  (e: "trace", path: string): void;
}>();

const open = ref(true);

function statusOf(title: string, persisted: string): string {
  return props.liveStatus[title] ?? persisted;
}

const summary = computed(() => {
  let regressions = 0;
  let pass = 0;
  for (const t of props.feature.tests) {
    const s = statusOf(t.title, t.status);
    if (s === "passed") pass++;
    if (isRegression({ status: s, baseline: t.baseline })) regressions++;
  }
  return { regressions, pass, total: props.feature.tests.length };
});

const barColor = computed(() =>
  summary.value.regressions > 0
    ? "var(--color-fail)"
    : healthColor(summary.value.pass, summary.value.total, 0),
);
</script>

<template>
  <section class="rise overflow-hidden rounded-md border border-line bg-card">
    <!-- header -->
    <header class="flex items-center gap-3 px-4 py-3">
      <button
        class="grid h-6 w-6 place-items-center rounded-sm text-ink-3 transition hover:text-accent"
        @click="open = !open"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4 transition-transform"
          :class="open ? 'rotate-90' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <span class="h-7 w-[3px]" :style="{ backgroundColor: barColor }" />

      <div class="min-w-0 flex-1">
        <h3 class="truncate font-display text-base font-bold text-ink">
          {{ feature.feature }}
        </h3>
        <p class="truncate text-[11px] text-ink-3">
          <template v-if="feature.sheetId">sheet {{ feature.sheetId }}</template>
          <span v-else class="text-flaky">no sheet registered</span>
          <span class="text-ink-3"> · {{ feature.specRelPath }}</span>
        </p>
      </div>

      <div class="tnum flex items-center gap-2 font-mono text-xs">
        <span v-if="summary.regressions" class="text-fail">▲ {{ summary.regressions }} regr</span>
        <span class="text-ink-3">{{ summary.pass }}/{{ summary.total }}</span>
      </div>

      <button
        class="rounded-sm border border-line px-2 py-1 text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
        title="Copy the /gen-tests command for Claude Code"
        @click="emit('gen', feature.feature)"
      >
        gen
      </button>
      <button
        class="rounded-sm border border-accent bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
        :disabled="running || !feature.tests.length"
        @click="emit('run', feature.feature)"
      >
        ▶ run
      </button>
    </header>

    <!-- test rows -->
    <ul v-if="open" class="border-t border-line">
      <li
        v-for="t in feature.tests"
        :key="t.testId"
        class="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
        :class="[
          isRegression({ status: statusOf(t.title, t.status), baseline: t.baseline }) ? 'bg-fail/8' : '',
          activeTitle === t.title ? 'tick-flash' : '',
        ]"
      >
        <span
          class="grid h-4 w-4 shrink-0 place-items-center text-xs"
          :class="statusOf(t.title, t.status) === 'running' ? 'pulse rounded-full' : ''"
          :style="{ color: look(statusOf(t.title, t.status)).color }"
        >
          {{ look(statusOf(t.title, t.status)).glyph }}
        </span>

        <span
          v-if="t.tcId"
          class="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-accent"
          >{{ t.tcId }}</span
        >

        <span class="min-w-0 flex-1 truncate text-ink">{{ t.title }}</span>

        <span
          v-if="isRegression({ status: statusOf(t.title, t.status), baseline: t.baseline })"
          class="shrink-0 rounded-sm bg-fail/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fail"
          >REGRESSION</span
        >

        <span v-if="t.durationMs != null" class="tnum shrink-0 font-mono text-[11px] text-ink-3">
          {{ (t.durationMs / 1000).toFixed(1) }}s
        </span>

        <button
          v-if="t.tracePath"
          class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
          @click="emit('trace', t.tracePath!)"
        >
          trace ↗
        </button>
      </li>
      <li v-if="!feature.tests.length" class="px-4 py-4 text-center text-xs text-ink-3">
        No tests generated yet —
        <button class="text-accent hover:underline" @click="emit('gen', feature.feature)">
          copy the /gen-tests command
        </button>
      </li>
    </ul>
  </section>
</template>
