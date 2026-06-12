<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import CodeEditor from "./CodeEditor.vue";
import { PLAYWRIGHT_SNIPPETS } from "../lib/playwrightSnippets";
import type { TestSourceView } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  testCase: TestSourceView | null;
  loading?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "save", oldTitle: string, title: string, source: string): void;
}>();

const confirm = useConfirm();
const editor = ref<InstanceType<typeof CodeEditor> | null>(null);
const snippetMenu = ref<InstanceType<typeof Menu> | null>(null);
const draftTitle = ref("");
const draftSource = ref("");

watch(
  () => props.testCase,
  (testCase) => {
    draftTitle.value = testCase?.title ?? "";
    draftSource.value = testCase?.source ?? "";
  },
  { immediate: true },
);

const dirty = computed(
  () =>
    !!props.testCase &&
    (draftTitle.value !== props.testCase.title || draftSource.value !== props.testCase.source),
);

const snippetItems = computed<MenuItem[]>(() =>
  PLAYWRIGHT_SNIPPETS.map((s) => ({
    label: s.label,
    detail: s.detail,
    command: () => editor.value?.insertSnippet(s.template),
  })),
);

function save() {
  if (!props.testCase || !dirty.value || props.saving || !draftTitle.value.trim()) return;
  emit("save", props.testCase.title, draftTitle.value.trim(), draftSource.value);
}

function handleVisible(next: boolean) {
  if (!next && dirty.value) {
    confirm.require({
      header: "Discard changes",
      message: "You have unsaved edits to this test case. Discard them?",
      icon: "pi pi-exclamation-triangle",
      rejectLabel: "Keep editing",
      acceptLabel: "Discard",
      acceptClass: "p-button-danger",
      accept: () => {
        draftTitle.value = props.testCase?.title ?? "";
        draftSource.value = props.testCase?.source ?? "";
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
    header="Edit test case"
    class="w-[min(1040px,94vw)]"
    :pt="{ content: { class: 'pb-0' } }"
    @update:visible="handleVisible"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="font-display text-base font-extrabold text-ink">Test case</span>
        <span
          v-if="testCase"
          class="rounded-sm border border-line-strong bg-card-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
        >
          {{ testCase.feature }}
        </span>
      </div>
    </template>

    <div v-if="testCase" class="grid gap-3">
      <div class="grid gap-1">
        <label class="label text-ink-3" for="test-title">title</label>
        <InputText id="test-title" v-model="draftTitle" class="font-mono text-xs" />
      </div>

      <div class="flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{{ testCase.specPath }}</p>
        <Button
          label="Snippets"
          icon="pi pi-code"
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
          v-model="draftSource"
          language="typescript"
          class="max-h-[62vh] min-h-[38vh] px-4"
          @save="save"
        />
      </div>
    </div>

    <div
      v-else
      class="rounded-md border border-line bg-sunken px-4 py-10 text-center text-sm text-ink-3"
    >
      {{ loading ? "Loading test case..." : "No test case selected." }}
    </div>

    <template #footer>
      <div class="flex w-full items-center gap-3">
        <span v-if="dirty" class="flex items-center gap-1.5 font-mono text-[11px] text-flaky">
          <span class="h-1.5 w-1.5 rounded-full bg-flaky" /> unsaved changes
        </span>
        <span v-else class="font-mono text-[11px] text-ink-3">saved · Cmd/Ctrl+S to save</span>
        <div class="ml-auto flex items-center gap-2">
          <Button label="Close" size="small" severity="secondary" text @click="handleVisible(false)" />
          <Button
            label="Save"
            icon="pi pi-save"
            size="small"
            :loading="saving"
            :disabled="!dirty || saving || !draftTitle.trim()"
            @click="save"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
