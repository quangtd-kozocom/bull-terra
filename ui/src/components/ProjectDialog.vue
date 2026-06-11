<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  mode: "create" | "rename";
  initialName?: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", name: string): void;
}>();

const name = shallowRef("");
const error = shallowRef("");

const title = computed(() => (props.mode === "create" ? "Create project" : "Rename project"));
const submitLabel = computed(() => (props.mode === "create" ? "Create project" : "Save project"));
const unchanged = computed(() => props.mode === "rename" && name.value.trim() === props.initialName);
const disabled = computed(() => props.saving || !name.value.trim() || unchanged.value);

watch(
  () => visible.value,
  (isVisible) => {
    if (!isVisible) return;
    name.value = props.initialName ?? "";
    error.value = "";
  },
);

function submit() {
  const nextName = name.value.trim();
  if (!nextName) {
    error.value = "Project name is required.";
    return;
  }

  emit("submit", nextName);
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: 'min(420px, calc(100vw - 32px))' }"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <label class="grid gap-2">
        <span class="label text-ink-3">project name</span>
        <InputText v-model="name" autofocus class="w-full font-mono text-sm" autocomplete="off" />
      </label>
      <p v-if="error" class="text-xs text-fail">{{ error }}</p>

      <footer class="flex justify-end gap-2 pt-2">
        <Button label="Cancel" severity="secondary" outlined size="small" @click="visible = false" />
        <Button :label="submitLabel" type="submit" size="small" :loading="saving" :disabled="disabled" />
      </footer>
    </form>
  </Dialog>
</template>
