<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { RunState } from "../composables/useRun";

const props = defineProps<{ state: RunState }>();
const emit = defineEmits<{ (e: "stop"): void }>();

const logEl = ref<HTMLElement | null>(null);
watch(
  () => props.state.log.length,
  async () => {
    await nextTick();
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
  },
);
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center justify-between border-b border-line px-4 py-3">
      <div class="flex items-center gap-2.5">
        <span
          class="h-2.5 w-2.5 rounded-full"
          :class="state.running ? 'pulse' : ''"
          :style="{
            backgroundColor: state.running
              ? '#f2a900'
              : state.finishedStatus === 'passed'
                ? '#74c365'
                : state.finishedStatus
                  ? '#ef5b3c'
                  : '#5c5345',
          }"
        />
        <span class="font-display text-sm font-bold uppercase tracking-wide text-parchment">
          {{ state.running ? "running" : state.finishedStatus ? "complete" : "console" }}
        </span>
        <span v-if="state.feature" class="font-mono text-[11px] text-parchment-dim"
          >› {{ state.feature }}</span
        >
        <span v-else-if="state.running" class="font-mono text-[11px] text-parchment-dim"
          >› all features</span
        >
      </div>
      <button
        v-if="state.running"
        class="rounded-sm border border-alarm/50 px-3 py-1 text-[11px] font-medium text-alarm transition hover:bg-alarm/15"
        @click="emit('stop')"
      >
        ■ stop
      </button>
    </header>

    <!-- verdict banner -->
    <div
      v-if="state.verdict"
      class="border-b border-line px-4 py-2.5 text-xs"
      :class="state.verdict.exitCode === 1 ? 'bg-alarm/12 text-alarm' : 'bg-signal/10 text-signal'"
    >
      <span class="font-bold">{{
        state.verdict.exitCode === 1 ? "✘ REGRESSION GATE FAILED" : "✓ GATE PASSED"
      }}</span>
      <span class="ml-2 text-parchment-dim">
        {{ state.verdict.passed.length }} passed · {{ state.verdict.regressions.length }} regressed ·
        {{ state.verdict.newFailures.length }} new-fail ·
        {{ state.verdict.quarantined.length }} quarantined
      </span>
    </div>

    <!-- log tail -->
    <div
      ref="logEl"
      class="flex-1 overflow-y-auto bg-soil/60 px-4 py-3 font-mono text-[11.5px] leading-relaxed"
    >
      <p v-if="!state.log.length" class="text-parchment-dim">
        Run a feature to stream Playwright output here.
      </p>
      <p
        v-for="(l, i) in state.log"
        :key="i"
        class="whitespace-pre-wrap"
        :class="l.stream === 'stderr' ? 'text-alarm/80' : 'text-parchment/70'"
      >
        {{ l.line }}
      </p>
    </div>
  </div>
</template>
