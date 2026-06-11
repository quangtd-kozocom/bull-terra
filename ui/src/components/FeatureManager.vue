<script setup lang="ts">
import { reactive, ref } from "vue";
import type { FeatureInput, FeatureView } from "../types";

defineProps<{
  features: FeatureView[];
}>();

const emit = defineEmits<{
  (e: "add", feature: FeatureInput): void;
  (e: "update", feature: string, next: FeatureInput): void;
  (e: "remove", feature: string): void;
}>();

const adding = ref(false);
const editing = ref<string | null>(null);
const form = reactive({ name: "", sheetId: "" });
const editForm = reactive({ name: "", sheetId: "" });
const error = ref("");
const editError = ref("");

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

function beginEdit(feature: FeatureView) {
  editing.value = feature.feature;
  editForm.name = feature.feature;
  editForm.sheetId = feature.sheetId ?? "";
  editError.value = "";
}

function cancelEdit() {
  editing.value = null;
  editForm.name = "";
  editForm.sheetId = "";
  editError.value = "";
}

function saveEdit(original: string) {
  if (!editForm.name.trim()) {
    editError.value = "A feature name is required.";
    return;
  }
  emit("update", original, {
    name: editForm.name.trim(),
    sheetId: editForm.sheetId.trim() || undefined,
  });
  cancelEdit();
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
        class="border-b border-line px-4 py-2 text-sm last:border-b-0"
      >
        <div v-if="editing === f.feature" class="grid grid-cols-1 gap-2">
          <input v-model="editForm.name" class="feat-in" @keyup.enter="saveEdit(f.feature)" />
          <input
            v-model="editForm.sheetId"
            class="feat-in"
            placeholder="Google Sheet id"
            @keyup.enter="saveEdit(f.feature)"
          />
          <p v-if="editError" class="text-[11px] text-fail">{{ editError }}</p>
          <div class="flex justify-end gap-2">
            <button
              class="rounded-sm border border-line-strong bg-card px-2 py-1 text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
              @click="cancelEdit"
            >
              cancel
            </button>
            <button
              class="rounded-sm border border-accent bg-accent/12 px-2 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/20"
              @click="saveEdit(f.feature)"
            >
              save
            </button>
          </div>
        </div>
        <div v-else class="flex items-center gap-2">
          <span class="w-24 shrink-0 truncate font-display text-sm font-bold text-ink">{{ f.feature }}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-[11px]" :class="f.sheetId ? 'text-ink-2' : 'text-flaky'">
            {{ f.sheetId || "no sheet — add one" }}
          </span>
          <span class="tnum shrink-0 font-mono text-[11px] text-ink-3">{{ f.tests.length }} tc</span>
          <button
            v-if="f.registered"
            class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-accent"
            title="Edit feature"
            @click="beginEdit(f)"
          >
            ✎
          </button>
          <button
            v-if="f.registered"
            class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-fail"
            title="Remove feature registration"
            @click="emit('remove', f.feature)"
          >
            ✕
          </button>
        </div>
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
