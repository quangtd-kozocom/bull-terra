<script setup lang="ts">
import type { ProjectView } from "../types";

defineProps<{
  projects: ProjectView[];
  selected: string | null;
}>();

const emit = defineEmits<{
  (e: "select", name: string): void;
  (e: "add"): void;
}>();

function health(p: ProjectView): { color: string; pct: number } {
  const { passed, tests } = p.totals;
  const pct = tests ? Math.round((passed / tests) * 100) : 0;
  const color = p.totals.failed > 0 ? "#ef5b3c" : pct === 100 && tests > 0 ? "#74c365" : "#d9b44a";
  return { color, pct };
}
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col border-r border-line bg-soil-2/70 backdrop-blur">
    <!-- Brand mark -->
    <div class="flex items-center gap-3 border-b border-line px-5 py-5">
      <div
        class="grid h-9 w-9 place-items-center rounded-sm border border-amber/60 bg-amber/10 text-amber"
      >
        <!-- bull/terra glyph: horns over a contour line -->
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M4 5c2 0 3 2 3 4M20 5c-2 0-3 2-3 4" stroke-linecap="round" />
          <circle cx="12" cy="13" r="4.2" />
          <path d="M3 20c3-1.5 6-1.5 9 0s6 1.5 9 0" stroke-linecap="round" opacity="0.7" />
        </svg>
      </div>
      <div>
        <h1 class="font-display text-lg font-extrabold leading-none text-parchment">bull-terra</h1>
        <p class="mt-1 text-[10px] uppercase tracking-[0.2em] text-parchment-dim">
          regression deck
        </p>
      </div>
    </div>

    <!-- Projects -->
    <div class="flex items-center justify-between px-5 pb-2 pt-4">
      <span class="text-[10px] uppercase tracking-[0.2em] text-parchment-dim">projects</span>
      <button
        class="rounded-sm border border-line-2 px-2 py-0.5 text-xs text-parchment-dim transition hover:border-amber hover:text-amber"
        @click="emit('add')"
      >
        + new
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 pb-4">
      <p v-if="!projects.length" class="px-2 py-6 text-center text-xs text-parchment-dim">
        No projects yet.<br />Register one to begin.
      </p>
      <button
        v-for="p in projects"
        :key="p.id"
        class="group mb-1 flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition"
        :class="
          selected === p.name
            ? 'border-amber/50 bg-amber/8'
            : 'border-transparent hover:border-line-2 hover:bg-panel/50'
        "
        @click="emit('select', p.name)"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :style="{ backgroundColor: health(p).color, boxShadow: `0 0 8px ${health(p).color}` }"
        />
        <span class="min-w-0 flex-1">
          <span
            class="block truncate text-sm font-medium"
            :class="selected === p.name ? 'text-parchment' : 'text-parchment/80'"
            >{{ p.name }}</span
          >
          <span class="block truncate text-[11px] text-parchment-dim">{{ p.url }}</span>
        </span>
        <span class="font-mono text-[11px] tabular-nums text-parchment-dim">
          {{ p.totals.passed }}/{{ p.totals.tests }}
        </span>
      </button>
    </nav>

    <footer class="border-t border-line px-5 py-3 text-[10px] text-parchment-dim">
      green means something.
    </footer>
  </aside>
</template>
