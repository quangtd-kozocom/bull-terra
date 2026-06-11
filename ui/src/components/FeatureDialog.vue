<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import type { FeatureInput, FeatureView } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  mode: "create" | "edit";
  feature?: FeatureView | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", value: FeatureInput): void;
}>();

const form = reactive({ name: "", sheetId: "", startPath: "/", requiresAuth: false });
const error = shallowRef("");

const title = computed(() =>
  props.mode === "create" ? "Add feature" : `Edit ${props.feature?.feature ?? "feature"}`,
);
const submitLabel = computed(() => (props.mode === "create" ? "Add feature" : "Save feature"));

watch(
  () => visible.value,
  (isVisible) => {
    if (!isVisible) return;
    form.name = props.feature?.feature ?? "";
    form.sheetId = props.feature?.sheetId ?? "";
    form.startPath = props.feature?.startPath ?? "/";
    form.requiresAuth = props.feature?.requiresAuth ?? false;
    error.value = "";
  },
);

function submit() {
  if (!form.name.trim()) {
    error.value = "Feature name is required.";
    return;
  }

  emit("submit", {
    name: form.name.trim(),
    sheetId: form.sheetId.trim() || undefined,
    startPath: form.startPath.trim() || "/",
    requiresAuth: form.requiresAuth,
  });
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: 'min(520px, calc(100vw - 32px))' }"
  >
    <form class="grid gap-4" @submit.prevent="submit">
      <label class="grid gap-2">
        <span class="label text-ink-3">feature name</span>
        <InputText v-model="form.name" autofocus class="w-full font-mono text-sm" autocomplete="off" />
      </label>
      <label class="grid gap-2">
        <span class="label text-ink-3">google sheet id</span>
        <InputText v-model="form.sheetId" class="w-full font-mono text-sm" placeholder="1aBcD..." />
      </label>
      <label class="grid gap-2">
        <span class="label text-ink-3">start path</span>
        <InputText v-model="form.startPath" class="w-full font-mono text-sm" placeholder="/checkout" />
      </label>
      <label class="flex items-center gap-2 rounded-md border border-line bg-app px-3 py-2">
        <Checkbox v-model="form.requiresAuth" binary input-id="requires-auth" />
        <span class="text-sm text-ink">requires auth state before recording</span>
      </label>
      <p v-if="error" class="text-xs text-fail">{{ error }}</p>

      <footer class="flex justify-end gap-2">
        <Button label="Cancel" severity="secondary" outlined size="small" @click="visible = false" />
        <Button
          :label="submitLabel"
          type="submit"
          size="small"
          :loading="saving"
          :disabled="saving || !form.name.trim()"
        />
      </footer>
    </form>
  </Dialog>
</template>
