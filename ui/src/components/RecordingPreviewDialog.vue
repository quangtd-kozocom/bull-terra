<script setup lang="ts">
import Dialog from "primevue/dialog";
import type { RecordingSourceView } from "../types";

const visible = defineModel<boolean>("visible", { required: true });

defineProps<{
  recording: RecordingSourceView | null;
  loading?: boolean;
}>();
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Recording preview"
    class="w-[min(960px,94vw)]"
    :pt="{ content: { class: 'pb-0' } }"
  >
    <div v-if="recording" class="grid gap-3">
      <div class="grid gap-1 rounded-md border border-line bg-app px-3 py-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-display text-sm font-bold text-ink">{{ recording.name }}</span>
          <span
            class="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3"
          >
            {{ recording.feature || "shared" }}
          </span>
          <span v-if="recording.isPrimary" class="rounded-sm bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
            primary
          </span>
        </div>
        <p class="truncate font-mono text-[11px] text-ink-3">{{ recording.path }}</p>
      </div>

      <pre
        class="max-h-[68vh] overflow-auto rounded-md border border-line bg-[#10130f] p-4 font-mono text-xs leading-relaxed text-[#d8e7ce]"
      ><code>{{ recording.source }}</code></pre>
    </div>

    <div v-else class="rounded-md border border-line bg-app px-4 py-10 text-center text-sm text-ink-3">
      {{ loading ? "Loading recording..." : "No recording selected." }}
    </div>
  </Dialog>
</template>
