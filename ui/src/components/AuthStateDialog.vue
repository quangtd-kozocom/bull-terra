<script setup lang="ts">
import { computed } from "vue";
import Dialog from "primevue/dialog";
import CodeEditor from "./CodeEditor.vue";
import type { AuthStateView } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
  state: AuthStateView | null;
  loading?: boolean;
}>();

// Read-only viewer — the buffer is never written back, so a plain computed is fine.
const source = computed(() => props.state?.source ?? "");

function ago(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  const mins = Math.max(0, (Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "captured just now";
  if (mins < 90) return `captured ${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 36) return `captured ${Math.round(hrs)}h ago`;
  return `captured ${Math.round(hrs / 24)}d ago`;
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    class="w-[min(1000px,94vw)]"
    :pt="{ content: { class: 'pb-0' } }"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="font-display text-base font-extrabold text-ink">
          {{ state ? `${state.env} — auth state` : "Auth state" }}
        </span>
        <span class="rounded-sm border border-line-strong bg-card-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
          read-only
        </span>
      </div>
    </template>

    <div v-if="state" class="grid gap-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{{ state.path }}</p>
        <span v-if="state.updatedAt" class="font-mono text-[11px] text-ink-3">{{ ago(state.updatedAt) }}</span>
      </div>

      <div class="overflow-hidden rounded-md border border-line-strong bg-sunken">
        <CodeEditor
          :model-value="source"
          language="json"
          read-only
          class="max-h-[68vh] min-h-[40vh] px-4"
        />
      </div>
      <p class="pb-1 text-[10px] text-ink-3">
        Playwright storageState — cookies and localStorage captured by “Login once”. Re-capture to refresh.
      </p>
    </div>

    <div
      v-else
      class="rounded-md border border-line bg-sunken px-4 py-10 text-center text-sm text-ink-3"
    >
      {{ loading ? "Loading auth state..." : "No auth state captured." }}
    </div>
  </Dialog>
</template>
