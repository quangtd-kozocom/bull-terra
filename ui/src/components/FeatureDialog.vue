<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from "vue";
import Button from "primevue/button";
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

const form = reactive({ name: "", sheetId: "" });
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
