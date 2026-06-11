<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "create", name: string): void;
}>();

const name = ref("");
const error = ref("");

function submit() {
  if (!name.value.trim()) {
    error.value = "A project name is required.";
    return;
  }
  emit("create", name.value.trim());
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="rise w-[440px] max-w-[92vw] rounded-md border border-line-strong bg-card p-6 shadow-2xl">
      <h2 class="font-display text-xl font-bold text-ink">New project</h2>
      <p class="mt-1 text-xs text-ink-2">
        A project is a container. Add its environments (local / stg) and features
        (one sheet each) next, from the project panel.
      </p>

      <label class="mt-5 block">
        <span class="label text-ink-2">project name</span>
        <input
          v-model="name"
          placeholder="app-a"
          autofocus
          class="mt-1.5 w-full rounded-sm border border-line-strong bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
          @keyup.enter="submit"
        />
      </label>

      <p v-if="error" class="mt-3 text-xs text-fail">{{ error }}</p>

      <div class="mt-6 flex justify-end gap-2">
        <button
          class="rounded-sm border border-line px-4 py-2 text-sm text-ink-2 transition hover:text-ink"
          @click="emit('close')"
        >
          cancel
        </button>
        <button
          class="rounded-sm border border-accent bg-accent/12 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
          @click="submit"
        >
          create
        </button>
      </div>
    </div>
  </div>
</template>
