<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import CodeEditor from "./CodeEditor.vue";
import { PLAYWRIGHT_SNIPPETS } from "../lib/playwrightSnippets";
import type { RecordingSourceView } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  recording: RecordingSourceView | null;
  loading?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{ (e: "save", recordingId: number, source: string): void }>();

const confirm = useConfirm();
const editor = ref<InstanceType<typeof CodeEditor> | null>(null);
const snippetMenu = ref<InstanceType<typeof Menu> | null>(null);
const draft = ref("");

// Reset the buffer whenever a different recording loads.
watch(
  () => props.recording,
  (rec) => {
    draft.value = rec?.source ?? "";
  },
  { immediate: true },
);

const dirty = computed(() => !!props.recording && draft.value !== props.recording.source);

const snippetItems = computed<MenuItem[]>(() =>
  PLAYWRIGHT_SNIPPETS.map((s) => ({
    label: s.label,
    detail: s.detail, // surfaced via the #item slot below
    command: () => editor.value?.insertSnippet(s.template),
  })),
);

function save() {
  if (!props.recording || !dirty.value || props.saving) return;
  emit("save", props.recording.id, draft.value);
}

function handleVisible(next: boolean) {
  if (!next && dirty.value) {
    confirm.require({
      header: "Discard changes",
      message: "You have unsaved edits to this recording. Discard them?",
      icon: "pi pi-exclamation-triangle",
      rejectLabel: "Keep editing",
      acceptLabel: "Discard",
      acceptClass: "p-button-danger",
      accept: () => {
        draft.value = props.recording?.source ?? "";
        visible.value = false;
      },
    });
    return;
  }
  visible.value = next;
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Edit recording"
    class="w-[min(1000px,94vw)]"
    :pt="{ content: { class: 'pb-0' } }"
    @update:visible="handleVisible"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="font-display text-base font-extrabold text-ink">
          {{ recording?.name ?? "Recording" }}
        </span>
        <span
          v-if="recording"
          class="rounded-sm border border-line-strong bg-card-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
        >
          {{ recording.feature || "shared" }}
        </span>
        <span
          v-if="recording?.isPrimary"
          class="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent"
        >
          base
        </span>
      </div>
    </template>

    <div v-if="recording" class="grid gap-2">
      <div class="flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{{ recording.path }}</p>
        <Button
          label="Snippets"
          icon="pi pi-code"
          icon-pos="left"
          size="small"
          severity="secondary"
          @click="snippetMenu?.toggle($event)"
        />
        <Menu ref="snippetMenu" :model="snippetItems" popup>
          <template #item="{ item, props: itemProps }">
            <a v-bind="itemProps.action" class="flex items-center justify-between gap-4">
              <span class="font-mono text-xs text-ink">{{ item.label }}</span>
              <span class="font-mono text-[10px] text-ink-3">{{ (item as any).detail }}</span>
            </a>
          </template>
        </Menu>
      </div>

      <div class="overflow-hidden rounded-md border border-line-strong bg-sunken">
        <CodeEditor
          ref="editor"
          v-model="draft"
          language="typescript"
          class="max-h-[64vh] min-h-[40vh] px-4"
          @save="save"
        />
      </div>
    </div>

    <div
      v-else
      class="rounded-md border border-line bg-sunken px-4 py-10 text-center text-sm text-ink-3"
    >
      {{ loading ? "Loading recording..." : "No recording selected." }}
    </div>

    <template #footer>
      <div class="flex w-full items-center gap-3">
        <span v-if="dirty" class="flex items-center gap-1.5 font-mono text-[11px] text-flaky">
          <span class="h-1.5 w-1.5 rounded-full bg-flaky" /> unsaved changes
        </span>
        <span v-else class="font-mono text-[11px] text-ink-3">saved · ⌘/Ctrl+S to save</span>
        <div class="ml-auto flex items-center gap-2">
          <Button label="Close" size="small" severity="secondary" text @click="handleVisible(false)" />
          <Button
            label="Save"
            icon="pi pi-save"
            size="small"
            :loading="saving"
            :disabled="!dirty || saving"
            @click="save"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
