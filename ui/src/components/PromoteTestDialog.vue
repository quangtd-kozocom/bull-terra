<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import type { RecordingView } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  recording: RecordingView | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", value: { tcId: string; title: string }): void;
}>();

const form = reactive({ tcId: "", title: "" });
const error = shallowRef("");

const title = computed(() => `Promote ${props.recording?.name ?? "recording"}`);

watch(
  () => visible.value,
  (isVisible) => {
    if (!isVisible) return;
    form.tcId = "";
    form.title = "";
    error.value = "";
  },
);

function submit() {
  if (!form.tcId.trim() || !form.title.trim()) {
    error.value = "TC id and title are required.";
    return;
  }
  emit("submit", { tcId: form.tcId.trim(), title: form.title.trim() });
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
      <div v-if="recording" class="rounded-md border border-line bg-app px-3 py-2">
        <p class="font-display text-sm font-bold text-ink">{{ recording.feature }}</p>
        <p class="truncate font-mono text-[11px] text-ink-3">{{ recording.path }}</p>
      </div>

      <label class="grid gap-2">
        <span class="label text-ink-3">tc id</span>
        <InputText v-model="form.tcId" autofocus class="w-full font-mono text-sm" placeholder="M01" />
      </label>

      <label class="grid gap-2">
        <span class="label text-ink-3">test title</span>
        <InputText v-model="form.title" class="w-full text-sm" placeholder="user can checkout" />
      </label>

      <p v-if="error" class="text-xs text-fail">{{ error }}</p>

      <footer class="flex justify-end gap-2">
        <Button label="Cancel" severity="secondary" outlined size="small" @click="visible = false" />
        <Button
          label="Create skeleton"
          type="submit"
          size="small"
          :loading="saving"
          :disabled="saving || !form.tcId.trim() || !form.title.trim()"
        />
      </footer>
    </form>
  </Dialog>
</template>
