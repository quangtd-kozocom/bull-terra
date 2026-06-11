<script setup lang="ts">
import { shallowRef } from "vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import EnvironmentDialog from "./EnvironmentDialog.vue";
import type { EnvironmentInput, EnvironmentView, NewEnvironment } from "../types";

const props = defineProps<{
  environments: EnvironmentView[];
  activeEnv: string | null;
  saving?: boolean;
  capturingAuth?: string | null;
}>();

const emit = defineEmits<{
  (e: "select", env: string): void;
  (e: "setDefault", env: string): void;
  (e: "remove", env: string): void;
  (e: "add", env: NewEnvironment): void;
  (e: "update", env: string, next: EnvironmentInput): void;
  (e: "captureAuth", env: string): void;
}>();

const confirm = useConfirm();
const dialogVisible = shallowRef(false);
const dialogMode = shallowRef<"create" | "edit">("create");
const editingEnv = shallowRef<EnvironmentView | null>(null);

function openCreate() {
  dialogMode.value = "create";
  editingEnv.value = null;
  dialogVisible.value = true;
}

function openEdit(env: EnvironmentView) {
  dialogMode.value = "edit";
  editingEnv.value = env;
  dialogVisible.value = true;
}

function submit(value: NewEnvironment | EnvironmentInput) {
  if (dialogMode.value === "create") {
    emit("add", value as NewEnvironment);
  } else if (editingEnv.value) {
    emit("update", editingEnv.value.name, value as EnvironmentInput);
  }
  dialogVisible.value = false;
}

function confirmRemove(env: EnvironmentView) {
  confirm.require({
    header: "Delete environment",
    message: `Delete environment "${env.name}"? Run history stays recorded.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete environment",
    acceptClass: "p-button-danger",
    accept: () => emit("remove", env.name),
  });
}
</script>

<template>
  <div class="rounded-md border border-line bg-card">
    <header class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <span class="label text-ink-2">environments</span>
      <Button label="Add" icon="pi pi-plus" size="small" severity="secondary" outlined @click="openCreate" />
    </header>

    <ul>
      <li
        v-for="env in environments"
        :key="env.id"
        class="border-b border-line px-4 py-3 text-sm last:border-b-0"
        :class="activeEnv === env.name ? 'bg-accent/8' : ''"
      >
        <div class="flex items-center gap-2">
          <Button
            icon="pi pi-circle-fill"
            text
            rounded
            size="small"
            :severity="activeEnv === env.name ? 'info' : 'secondary'"
            :aria-label="`Use ${env.name} as run target`"
            v-tooltip.top="'Run target / view environment'"
            @click="emit('select', env.name)"
          />
          <Button
            :icon="env.isDefault ? 'pi pi-star-fill' : 'pi pi-star'"
            text
            rounded
            size="small"
            :severity="env.isDefault ? 'info' : 'secondary'"
            :aria-label="env.isDefault ? 'Default environment' : `Set ${env.name} as default`"
            v-tooltip.top="env.isDefault ? 'Default environment' : 'Set as default'"
            @click="emit('setDefault', env.name)"
          />

          <span class="w-20 shrink-0 truncate font-display text-sm font-bold text-ink">{{ env.name }}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{{ env.url }}</span>
          <Tag
            v-for="key in Object.keys(env.secretVars)"
            :key="key"
            severity="secondary"
            :value="key"
            class="max-w-28 truncate font-mono"
            v-tooltip.top="`$${env.secretVars[key]}`"
          />

          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="`Edit ${env.name}`"
            v-tooltip.top="'Edit environment'"
            @click="openEdit(env)"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            :aria-label="`Delete ${env.name}`"
            v-tooltip.top="'Delete environment'"
            @click="confirmRemove(env)"
          />
        </div>
        <div class="mt-2 flex items-center gap-2 pl-20">
          <Tag
            :severity="env.authStateExists ? 'success' : 'warn'"
            :value="env.authStateExists ? 'auth ready' : 'auth missing'"
            class="font-mono"
          />
          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
            {{ env.authStatePath }}
            <template v-if="env.authStateUpdatedAt"> · {{ env.authStateUpdatedAt }}</template>
          </span>
          <Button
            label="Login once"
            icon="pi pi-key"
            size="small"
            severity="secondary"
            outlined
            :loading="capturingAuth === env.name"
            :disabled="saving || !!capturingAuth"
            @click="emit('captureAuth', env.name)"
          />
        </div>
      </li>
      <li v-if="!environments.length" class="px-4 py-4 text-center text-xs text-ink-3">
        No environments. Add local / dev / stg targets.
      </li>
    </ul>

    <EnvironmentDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :environment="editingEnv"
      :saving="saving"
      @submit="submit"
    />
  </div>
</template>
