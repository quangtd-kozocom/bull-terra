<script setup lang="ts">
import { reactive, ref } from "vue";
import type { EnvironmentInput, EnvironmentView, NewEnvironment } from "../types";

defineProps<{
  environments: EnvironmentView[];
  activeEnv: string | null;
}>();

const emit = defineEmits<{
  (e: "select", env: string): void;
  (e: "setDefault", env: string): void;
  (e: "remove", env: string): void;
  (e: "add", env: NewEnvironment): void;
  (e: "update", env: string, next: EnvironmentInput): void;
}>();

const adding = ref(false);
const editing = ref<string | null>(null);
const form = reactive<NewEnvironment>({ name: "", url: "https://", userVar: "", passVar: "" });
const editForm = reactive<EnvironmentInput>({ name: "", url: "", userVar: "", passVar: "" });
const error = ref("");
const editError = ref("");

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

function beginEdit(env: EnvironmentView) {
  editing.value = env.name;
  Object.assign(editForm, {
    name: env.name,
    url: env.url,
    userVar: env.userVar ?? "",
    passVar: env.passVar ?? "",
  });
  editError.value = "";
}

function cancelEdit() {
  editing.value = null;
  Object.assign(editForm, { name: "", url: "", userVar: "", passVar: "" });
  editError.value = "";
}

function saveEdit(original: string) {
  if (!editForm.name.trim() || !editForm.url.trim()) {
    editError.value = "Name and URL are required.";
    return;
  }
  emit("update", original, {
    name: editForm.name.trim(),
    url: editForm.url.trim(),
    userVar: editForm.userVar?.trim() || undefined,
    passVar: editForm.passVar?.trim() || undefined,
  });
  cancelEdit();
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
        class="border-b border-line px-4 py-2 text-sm last:border-b-0"
        :class="activeEnv === e.name ? 'bg-accent/8' : ''"
      >
        <div v-if="editing === e.name" class="grid grid-cols-2 gap-2">
          <input v-model="editForm.name" class="env-in" @keyup.enter="saveEdit(e.name)" />
          <input v-model="editForm.url" class="env-in" @keyup.enter="saveEdit(e.name)" />
          <input
            v-model="editForm.userVar"
            class="env-in"
            placeholder="APP_STG_USER"
            @keyup.enter="saveEdit(e.name)"
          />
          <input
            v-model="editForm.passVar"
            class="env-in"
            placeholder="APP_STG_PASS"
            @keyup.enter="saveEdit(e.name)"
          />
          <p v-if="editError" class="col-span-2 text-[11px] text-fail">{{ editError }}</p>
          <div class="col-span-2 flex justify-end gap-2">
            <button
              class="rounded-sm border border-line-strong bg-card px-2 py-1 text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
              @click="cancelEdit"
            >
              cancel
            </button>
            <button
              class="rounded-sm border border-accent bg-accent/12 px-2 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/20"
              @click="saveEdit(e.name)"
            >
              save
            </button>
          </div>
        </div>
        <div v-else class="flex items-center gap-2">
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
          <span
            v-if="e.userVar"
            class="shrink-0 font-mono text-[10px] text-ink-3"
            :title="`creds: $${e.userVar} / $${e.passVar}`"
          >
            🔑 {{ e.userVar }}
          </span>
          <button
            class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-accent"
            title="Edit environment"
            @click="beginEdit(e)"
          >
            ✎
          </button>
          <button
            class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-fail"
            title="Remove environment"
            @click="emit('remove', e.name)"
          >
            ✕
          </button>
        </div>
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
