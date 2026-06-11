<script setup lang="ts">
import { shallowRef } from "vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import FeatureDialog from "./FeatureDialog.vue";
import type { FeatureInput, FeatureView } from "../types";

defineProps<{
  features: FeatureView[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "add", feature: FeatureInput): void;
  (e: "update", feature: string, next: FeatureInput): void;
  (e: "remove", feature: string): void;
}>();

const confirm = useConfirm();
const dialogVisible = shallowRef(false);
const dialogMode = shallowRef<"create" | "edit">("create");
const editingFeature = shallowRef<FeatureView | null>(null);

function openCreate() {
  dialogMode.value = "create";
  editingFeature.value = null;
  dialogVisible.value = true;
}

function openEdit(feature: FeatureView) {
  dialogMode.value = "edit";
  editingFeature.value = feature;
  dialogVisible.value = true;
}

function submit(value: FeatureInput) {
  if (dialogMode.value === "create") {
    emit("add", value);
  } else if (editingFeature.value) {
    emit("update", editingFeature.value.feature, value);
  }
  dialogVisible.value = false;
}

function confirmRemove(feature: FeatureView) {
  confirm.require({
    header: "Remove feature",
    message: `Remove feature "${feature.feature}" and its Google Sheet link? Generated specs stay on disk.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Remove feature",
    acceptClass: "p-button-danger",
    accept: () => emit("remove", feature.feature),
  });
}
</script>

<template>
  <div class="rounded-md border border-line bg-card">
    <header class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <span class="label text-ink-2">features</span>
      <Button label="Add" icon="pi pi-plus" size="small" severity="secondary" outlined @click="openCreate" />
    </header>

    <ul>
      <li
        v-for="feature in features"
        :key="feature.feature"
        class="border-b border-line px-4 py-3 text-sm last:border-b-0"
      >
        <div class="flex items-center gap-2">
          <span class="w-28 shrink-0 truncate font-display text-sm font-bold text-ink">
            {{ feature.feature }}
          </span>
          <span
            class="min-w-0 flex-1 truncate font-mono text-[11px]"
            :class="feature.sheetId ? 'text-ink-2' : 'text-flaky'"
          >
            {{ feature.sheetId || "No sheet linked" }}
          </span>
          <Tag severity="secondary" :value="`${feature.tests.length} tc`" class="font-mono" />

          <Button
            v-if="feature.registered"
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="`Edit ${feature.feature}`"
            v-tooltip.top="'Edit feature'"
            @click="openEdit(feature)"
          />
          <Button
            v-if="feature.registered"
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            :aria-label="`Remove ${feature.feature}`"
            v-tooltip.top="'Remove feature registration'"
            @click="confirmRemove(feature)"
          />
        </div>
      </li>
      <li v-if="!features.length" class="px-4 py-4 text-center text-xs text-ink-3">
        No features. Each feature maps to one Google Sheet.
      </li>
    </ul>

    <FeatureDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :feature="editingFeature"
      :saving="saving"
      @submit="submit"
    />
  </div>
</template>
