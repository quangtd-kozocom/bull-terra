<script setup lang="ts">
import Button from "primevue/button";
import type { ProjectView } from "../types";
import { healthColor } from "../lib/status";
import ThemeToggle from "./ThemeToggle.vue";

defineProps<{
  projects: ProjectView[];
  selected: string | null;
}>();

const emit = defineEmits<{
  (e: "select", name: string): void;
  (e: "add"): void;
  (e: "rename", name: string): void;
  (e: "remove", name: string): void;
}>();

function health(p: ProjectView): { color: string; pct: number } {
  const { passed, tests, failed } = p.totals;
  const pct = tests ? Math.round((passed / tests) * 100) : 0;
  return { color: healthColor(passed, tests, failed), pct };
}
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col border-r border-line bg-card">
    <!-- Brand mark -->
    <div class="flex items-center gap-3 border-b border-line px-5 py-[18px]">
      <div class="grid h-9 w-9 place-items-center rounded-sm border border-accent text-accent">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M4 5c2 0 3 2 3 4M20 5c-2 0-3 2-3 4" stroke-linecap="round" />
          <circle cx="12" cy="13" r="4.2" />
          <path d="M3 20c3-1.5 6-1.5 9 0s6 1.5 9 0" stroke-linecap="round" opacity="0.7" />
        </svg>
      </div>
      <div class="min-w-0">
        <h1 class="font-display text-lg font-extrabold leading-none text-ink">bull-terra</h1>
        <p class="label mt-1 text-ink-3">test instrument</p>
      </div>
    </div>

    <!-- Projects -->
    <div class="flex items-center justify-between px-5 pb-2 pt-4">
      <span class="label text-ink-3">projects</span>
      <Button label="New" icon="pi pi-plus" size="small" severity="secondary" outlined @click="emit('add')" />
    </div>

    <nav class="flex-1 overflow-y-auto px-3 pb-4">
      <p v-if="!projects.length" class="px-2 py-6 text-center text-xs text-ink-3">
        No projects yet.<br />Create one to begin.
      </p>
      <div
        v-for="p in projects"
        :key="p.id"
        class="group mb-1 flex w-full items-center gap-2 border-l-2 py-1.5 pl-3 pr-2 transition"
        :class="
          selected === p.name
            ? 'border-accent bg-accent/8'
            : 'border-transparent hover:bg-card-2'
        "
      >
        <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="emit('select', p.name)">
          <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: health(p).color }" />
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm font-medium"
              :class="selected === p.name ? 'text-ink' : 'text-ink-2'"
              >{{ p.name }}</span
            >
            <span class="block truncate text-[11px] text-ink-3">
              {{ p.environments.length }} env · {{ p.features.length }} feat
            </span>
          </span>
          <span class="tnum shrink-0 font-mono text-[11px] text-ink-3">
            {{ p.totals.passed }}/{{ p.totals.tests }}
          </span>
        </button>
        <span class="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="`Rename ${p.name}`"
            v-tooltip.top="'Rename project'"
            @click.stop="emit('rename', p.name)"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            :aria-label="`Delete ${p.name}`"
            v-tooltip.top="'Delete project'"
            @click.stop="emit('remove', p.name)"
          />
        </span>
      </div>
    </nav>

    <footer class="flex items-center justify-between border-t border-line px-4 py-3">
      <span class="text-[10px] text-ink-3">green means something.</span>
      <ThemeToggle />
    </footer>
  </aside>
</template>
