<script setup lang="ts">
import { computed, reactive } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import type { FeatureView, RecordingView } from "../types";

const props = defineProps<{
  features: FeatureView[];
  recordings: RecordingView[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "record", feature: string, name: string): void;
  (e: "view", recordingId: number): void;
  (e: "promote", recordingId: number): void;
  (e: "remove", recording: RecordingView): void;
}>();

const draftNames = reactive<Record<string, string>>({});

const featureRows = computed(() =>
  props.features.map((feature) => ({
    name: feature.feature,
    recordings: props.recordings.filter((recording) => recording.feature === feature.feature),
    hasBase: feature.hasBaseRecording,
  })),
);

const sharedRecordings = computed(() =>
  props.recordings.filter((recording) => recording.feature == null),
);

function recordNamed(feature: string) {
  const name = draftNames[feature]?.trim();
  if (!name) return;
  emit("record", feature, name);
  draftNames[feature] = "";
}
</script>

<template>
  <div class="rounded-md border border-line bg-card">
    <header class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <span class="label text-ink-2">recordings</span>
      <Tag severity="secondary" :value="`${recordings.length} files`" class="font-mono" />
    </header>

    <div class="max-h-[420px] overflow-y-auto">
      <div
        v-for="row in featureRows"
        :key="row.name"
        class="border-b border-line px-4 py-3 last:border-b-0"
      >
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate font-display text-sm font-bold text-ink">
            {{ row.name }}
          </span>
          <Tag
            :severity="row.hasBase ? 'success' : 'warn'"
            :value="row.hasBase ? 'base ready' : 'missing base'"
            class="font-mono"
          />
          <Button
            label="Record base"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            outlined
            :disabled="saving"
            @click="emit('record', row.name, 'base')"
          />
        </div>

        <ul v-if="row.recordings.length" class="mt-3 grid gap-2">
          <li
            v-for="recording in row.recordings"
            :key="recording.id"
            class="flex items-center gap-2 rounded-md border border-line bg-app px-3 py-2"
          >
            <span class="w-28 shrink-0 truncate font-mono text-xs text-ink">{{ recording.name }}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
              {{ recording.path }}
            </span>
            <Tag v-if="recording.isPrimary" value="primary" severity="info" class="font-mono" />
            <Button
              icon="pi pi-eye"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`View ${recording.name}`"
              v-tooltip.top="'View source'"
              @click="emit('view', recording.id)"
            />
            <Button
              icon="pi pi-file-plus"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`Promote ${recording.name}`"
              v-tooltip.top="'Promote to test'"
              @click="emit('promote', recording.id)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              size="small"
              severity="danger"
              :disabled="saving"
              :aria-label="`Delete ${recording.name}`"
              v-tooltip.top="'Delete recording'"
              @click="emit('remove', recording)"
            />
          </li>
        </ul>

        <p v-else class="mt-3 rounded-md border border-dashed border-line px-3 py-3 text-xs text-ink-3">
          No recordings for this feature yet.
        </p>

        <div class="mt-3 flex items-center gap-2">
          <InputText
            v-model="draftNames[row.name]"
            size="small"
            class="min-w-0 flex-1 font-mono text-xs"
            placeholder="named flow"
            @keydown.enter="recordNamed(row.name)"
          />
          <Button
            label="Record named"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            :disabled="saving || !draftNames[row.name]?.trim()"
            @click="recordNamed(row.name)"
          />
        </div>
      </div>

      <div v-if="sharedRecordings.length" class="border-t border-line-strong px-4 py-3">
        <p class="label mb-2 text-ink-3">unassigned legacy recordings</p>
        <ul class="grid gap-2">
          <li
            v-for="recording in sharedRecordings"
            :key="recording.id"
            class="flex items-center gap-2 rounded-md border border-line bg-app px-3 py-2"
          >
            <span class="w-28 shrink-0 truncate font-mono text-xs text-ink">{{ recording.name }}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
              {{ recording.path }}
            </span>
            <Button
              icon="pi pi-eye"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`View ${recording.name}`"
              v-tooltip.top="'View source'"
              @click="emit('view', recording.id)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              size="small"
              severity="danger"
              :disabled="saving"
              :aria-label="`Delete ${recording.name}`"
              v-tooltip.top="'Delete recording'"
              @click="emit('remove', recording)"
            />
          </li>
        </ul>
      </div>

      <p v-if="!featureRows.length" class="px-4 py-4 text-center text-xs text-ink-3">
        Add features before recording flows.
      </p>
    </div>
  </div>
</template>
