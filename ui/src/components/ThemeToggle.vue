<script setup lang="ts">
import { computed } from "vue";
import { cycleTheme, pref } from "../lib/theme";

const meta = computed(() => {
  switch (pref.value) {
    case "light":
      return { glyph: "☀", label: "light" };
    case "dark":
      return { glyph: "☾", label: "dark" };
    default:
      return { glyph: "◐", label: "auto" };
  }
});
</script>

<template>
  <button
    class="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-ink-2 transition hover:border-accent hover:text-accent"
    :title="`Theme: ${meta.label} (click to cycle)`"
    @click="cycleTheme"
  >
    <span class="text-sm leading-none">{{ meta.glyph }}</span>
    <span class="label">{{ meta.label }}</span>
  </button>
</template>
