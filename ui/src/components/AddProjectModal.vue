<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "create", body: { name: string; url: string; sheetId?: string }): void;
}>();

const name = ref("");
const url = ref("https://");
const sheetId = ref("");
const error = ref("");

function submit() {
  if (!name.value.trim() || !url.value.trim()) {
    error.value = "Name and URL are required.";
    return;
  }
  emit("create", {
    name: name.value.trim(),
    url: url.value.trim(),
    sheetId: sheetId.value.trim() || undefined,
  });
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-soil/80 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="rise w-[440px] max-w-[92vw] rounded-lg border border-line-2 bg-panel p-6 shadow-2xl">
      <h2 class="font-display text-xl font-extrabold text-parchment">Register project</h2>
      <p class="mt-1 text-xs text-parchment-dim">
        Each project has its own URL, sheet and recordings.
      </p>

      <div class="mt-5 space-y-4">
        <label class="block">
          <span class="text-[11px] uppercase tracking-wider text-parchment-dim">name</span>
          <input
            v-model="name"
            placeholder="app-a"
            class="mt-1 w-full rounded-sm border border-line-2 bg-soil px-3 py-2 font-mono text-sm text-parchment outline-none focus:border-amber"
          />
        </label>
        <label class="block">
          <span class="text-[11px] uppercase tracking-wider text-parchment-dim">base url</span>
          <input
            v-model="url"
            class="mt-1 w-full rounded-sm border border-line-2 bg-soil px-3 py-2 font-mono text-sm text-parchment outline-none focus:border-amber"
          />
        </label>
        <label class="block">
          <span class="text-[11px] uppercase tracking-wider text-parchment-dim"
            >google sheet id <span class="normal-case opacity-60">(optional)</span></span
          >
          <input
            v-model="sheetId"
            placeholder="1aBcD…"
            class="mt-1 w-full rounded-sm border border-line-2 bg-soil px-3 py-2 font-mono text-sm text-parchment outline-none focus:border-amber"
          />
        </label>
      </div>

      <p v-if="error" class="mt-3 text-xs text-alarm">{{ error }}</p>

      <div class="mt-6 flex justify-end gap-2">
        <button
          class="rounded-sm border border-line-2 px-4 py-2 text-sm text-parchment-dim transition hover:text-parchment"
          @click="emit('close')"
        >
          cancel
        </button>
        <button
          class="rounded-sm border border-amber/50 bg-amber/15 px-4 py-2 text-sm font-medium text-amber transition hover:bg-amber/25"
          @click="submit"
        >
          register
        </button>
      </div>
    </div>
  </div>
</template>
