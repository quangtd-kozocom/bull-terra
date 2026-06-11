<script setup lang="ts">
import { reactive, ref } from "vue";
import type { FeatureView } from "../types";

defineProps<{
  features: FeatureView[];
}>();

const emit = defineEmits<{
  (e: "add", feature: { name: string; sheetId?: string }): void;
  (e: "remove", feature: string): void;
}>();

const adding = ref(false);
const form = reactive({ name: "", sheetId: "" });
const error = ref("");

function submit() {
  if (!form.name.trim()) {
    error.value = "A feature name is required.";
    return;
  }
  emit("add", { name: form.name.trim(), sheetId: form.sheetId.trim() || undefined });
  form.name = "";
  form.sheetId = "";
  adding.value = false;
  error.value = "";
}
</script>

<template>
  <div class="rounded-md border border-line bg-card">
    <header class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <span class="label text-ink-2">features &amp; sheets</span>
      <button
        class="rounded-sm border border-line px-2 py-0.5 text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
        @click="adding = !adding"
      >
        {{ adding ? "cancel" : "+ add" }}
      </button>
    </header>

    <ul>
      <li
        v-for="f in features"
        :key="f.feature"
        class="flex items-center gap-2 border-b border-line px-4 py-2 text-sm last:border-b-0"
      >
        <span class="w-24 shrink-0 truncate font-display text-sm font-bold text-ink">{{ f.feature }}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-[11px]" :class="f.sheetId ? 'text-ink-2' : 'text-flaky'">
          {{ f.sheetId || "no sheet — add one" }}
        </span>
        <span class="tnum shrink-0 font-mono text-[11px] text-ink-3">{{ f.tests.length }} tc</span>
        <button
          v-if="f.registered"
          class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-fail"
          title="Remove feature registration"
          @click="emit('remove', f.feature)"
        >
          ✕
        </button>
      </li>
      <li v-if="!features.length && !adding" class="px-4 py-3 text-center text-xs text-ink-3">
        No features. Each feature maps to one Google Sheet.
      </li>
    </ul>

    <div v-if="adding" class="grid grid-cols-1 gap-2 border-t border-line bg-card-2 px-4 py-3">
      <input v-model="form.name" placeholder="checkout" class="feat-in" @keyup.enter="submit" />
      <input v-model="form.sheetId" placeholder="Google Sheet id (1aBcD…)" class="feat-in" @keyup.enter="submit" />
      <p v-if="error" class="text-[11px] text-fail">{{ error }}</p>
      <button
        class="rounded-sm border border-accent bg-accent/12 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
        @click="submit"
      >
        add feature
      </button>
    </div>
  </div>
</template>

<style scoped>
.feat-in {
  border: 1px solid var(--color-line-strong);
  background: var(--color-paper);
  border-radius: 2px;
  padding: 0.4rem 0.6rem;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink);
  outline: none;
}
.feat-in:focus {
  border-color: var(--color-accent);
}
</style>
