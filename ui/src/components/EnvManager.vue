<script setup lang="ts">
import { reactive, ref } from "vue";
import type { EnvironmentView, NewEnvironment } from "../types";

defineProps<{
  environments: EnvironmentView[];
  activeEnv: string | null;
}>();

const emit = defineEmits<{
  (e: "select", env: string): void;
  (e: "setDefault", env: string): void;
  (e: "remove", env: string): void;
  (e: "add", env: NewEnvironment): void;
}>();

const adding = ref(false);
const form = reactive<NewEnvironment>({ name: "", url: "https://", userVar: "", passVar: "" });
const error = ref("");

function submit() {
  if (!form.name.trim() || !form.url.trim()) {
    error.value = "Name and URL are required.";
    return;
  }
  emit("add", {
    name: form.name.trim(),
    url: form.url.trim(),
    userVar: form.userVar?.trim() || undefined,
    passVar: form.passVar?.trim() || undefined,
  });
  Object.assign(form, { name: "", url: "https://", userVar: "", passVar: "" });
  adding.value = false;
  error.value = "";
}
</script>

<template>
  <div class="rounded-md border border-line bg-card">
    <header class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <span class="label text-ink-2">environments</span>
      <button
        class="rounded-sm border border-line px-2 py-0.5 text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
        @click="adding = !adding"
      >
        {{ adding ? "cancel" : "+ add" }}
      </button>
    </header>

    <ul>
      <li
        v-for="e in environments"
        :key="e.id"
        class="flex items-center gap-2 border-b border-line px-4 py-2 text-sm last:border-b-0"
        :class="activeEnv === e.name ? 'bg-accent/8' : ''"
      >
        <button
          class="grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px]"
          :class="activeEnv === e.name ? 'border-accent text-accent' : 'border-line-strong text-transparent'"
          title="Run target / view environment"
          @click="emit('select', e.name)"
        >
          ●
        </button>
        <button
          class="shrink-0 text-sm leading-none"
          :class="e.isDefault ? 'text-accent' : 'text-ink-3 hover:text-ink-2'"
          :title="e.isDefault ? 'Default environment' : 'Set as default'"
          @click="emit('setDefault', e.name)"
        >
          ★
        </button>
        <span class="w-16 shrink-0 truncate font-display text-sm font-bold text-ink">{{ e.name }}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{{ e.url }}</span>
        <span v-if="e.userVar" class="shrink-0 font-mono text-[10px] text-ink-3" :title="`creds: $${e.userVar} / $${e.passVar}`">
          🔑 {{ e.userVar }}
        </span>
        <button
          class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-fail"
          title="Remove environment"
          @click="emit('remove', e.name)"
        >
          ✕
        </button>
      </li>
      <li v-if="!environments.length && !adding" class="px-4 py-3 text-center text-xs text-ink-3">
        No environments. Add local / dev / stg targets.
      </li>
    </ul>

    <!-- add form -->
    <div v-if="adding" class="grid grid-cols-2 gap-2 border-t border-line bg-card-2 px-4 py-3">
      <input v-model="form.name" placeholder="stg" class="env-in" @keyup.enter="submit" />
      <input v-model="form.url" placeholder="https://stg.app.com" class="env-in" @keyup.enter="submit" />
      <input v-model="form.userVar" placeholder="APP_STG_USER (env var name)" class="env-in" @keyup.enter="submit" />
      <input v-model="form.passVar" placeholder="APP_STG_PASS (env var name)" class="env-in" @keyup.enter="submit" />
      <p v-if="error" class="col-span-2 text-[11px] text-fail">{{ error }}</p>
      <button
        class="col-span-2 rounded-sm border border-accent bg-accent/12 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
        @click="submit"
      >
        add environment
      </button>
    </div>
  </div>
</template>

<style scoped>
.env-in {
  border: 1px solid var(--color-line-strong);
  background: var(--color-paper);
  border-radius: 2px;
  padding: 0.4rem 0.6rem;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink);
  outline: none;
}
.env-in:focus {
  border-color: var(--color-accent);
}
</style>
