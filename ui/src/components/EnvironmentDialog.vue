<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import type { EnvironmentInput, EnvironmentView, NewEnvironment } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  mode: "create" | "edit";
  environment?: EnvironmentView | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", value: NewEnvironment | EnvironmentInput): void;
}>();

const form = reactive<NewEnvironment>({
  name: "",
  url: "https://",
  userVar: "",
  passVar: "",
  isDefault: false,
});
const error = shallowRef("");

const title = computed(() =>
  props.mode === "create" ? "Add environment" : `Edit ${props.environment?.name ?? "environment"}`,
);
const submitLabel = computed(() => (props.mode === "create" ? "Add environment" : "Save environment"));

watch(
  () => visible.value,
  (isVisible) => {
    if (!isVisible) return;
    Object.assign(form, {
      name: props.environment?.name ?? "",
      url: props.environment?.url ?? "https://",
      userVar: props.environment?.userVar ?? "",
      passVar: props.environment?.passVar ?? "",
      isDefault: false,
    });
    error.value = "";
  },
);

function submit() {
  if (!form.name.trim() || !form.url.trim()) {
    error.value = "Name and URL are required.";
    return;
  }

  const payload: NewEnvironment = {
    name: form.name.trim(),
    url: form.url.trim(),
    userVar: form.userVar?.trim() || undefined,
    passVar: form.passVar?.trim() || undefined,
  };

  if (props.mode === "create") payload.isDefault = form.isDefault;

  emit("submit", payload);
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: 'min(560px, calc(100vw - 32px))' }"
  >
    <form class="grid gap-4" @submit.prevent="submit">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="grid gap-2">
          <span class="label text-ink-3">name</span>
          <InputText v-model="form.name" autofocus class="w-full font-mono text-sm" autocomplete="off" />
        </label>
        <label class="grid gap-2">
          <span class="label text-ink-3">url</span>
          <InputText v-model="form.url" class="w-full font-mono text-sm" autocomplete="off" />
        </label>
        <label class="grid gap-2">
          <span class="label text-ink-3">user env var</span>
          <InputText v-model="form.userVar" class="w-full font-mono text-sm" placeholder="APP_STG_USER" />
        </label>
        <label class="grid gap-2">
          <span class="label text-ink-3">password env var</span>
          <InputText v-model="form.passVar" class="w-full font-mono text-sm" placeholder="APP_STG_PASS" />
        </label>
      </div>

      <label v-if="mode === 'create'" class="flex items-center gap-2 text-xs text-ink-2">
        <Checkbox v-model="form.isDefault" binary input-id="default-env" />
        <span>Set as default environment</span>
      </label>

      <p v-if="error" class="text-xs text-fail">{{ error }}</p>

      <footer class="flex justify-end gap-2">
        <Button label="Cancel" severity="secondary" outlined size="small" @click="visible = false" />
        <Button
          :label="submitLabel"
          type="submit"
          size="small"
          :loading="saving"
          :disabled="saving || !form.name.trim() || !form.url.trim()"
        />
      </footer>
    </form>
  </Dialog>
</template>
