<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import type { FeatureView, RecordingView } from "../types";
import { healthColor, isRegression, look } from "../lib/status";
import { artifactKind, artifactLabel, artifactUrl } from "../lib/artifacts";
import HistorySparkline from "./HistorySparkline.vue";

const props = defineProps<{
  feature: FeatureView;
  liveStatus: Record<string, string>;
  running: boolean;
  activeTitle: string | null;
  /** Test ids marked to record a video for on the next run. */
  videoTestIds: string[];
}>();

const emit = defineEmits<{
  (e: "run", feature: string): void;
  (e: "gen", feature: string): void;
  (e: "record", feature: string, name: string): void;
  (e: "viewRecording", recordingId: number): void;
  (e: "promote", recordingId: number): void;
  (e: "removeRecording", recording: RecordingView): void;
  (e: "removeRecordings", recordings: RecordingView[]): void;
  (e: "edit", feature: FeatureView): void;
  (e: "removeFeature", feature: string): void;
  (e: "trace", path: string): void;
  (e: "deleteTest", feature: string, title: string): void;
  (e: "deleteTests", feature: string, titles: string[]): void;
  (e: "toggleVideo", testId: string): void;
}>();

/** True when this test is marked for video recording on the next run. */
const recordsVideo = (testId: string) => props.videoTestIds.includes(testId);

/** Google Sheets deep-link for the linked sheet, if any. */
const sheetUrl = computed(() =>
  props.feature.sheetId
    ? `https://docs.google.com/spreadsheets/d/${props.feature.sheetId}/edit`
    : null,
);

const open = shallowRef(false);
const testsOpen = shallowRef(true);
const recordingsOpen = shallowRef(true);
const draftName = ref("");
const menu = ref<InstanceType<typeof Menu> | null>(null);

const selectedTests = ref(new Set<string>());
const selectedRecs = ref(new Set<number>());

function statusOf(title: string, persisted: string): string {
  return props.liveStatus[title] ?? persisted;
}

const summary = computed(() => {
  let regressions = 0;
  let pass = 0;
  for (const t of props.feature.tests) {
    const s = statusOf(t.title, t.status);
    if (s === "passed") pass++;
    if (isRegression({ status: s, baseline: t.baseline })) regressions++;
  }
  return { regressions, pass, total: props.feature.tests.length };
});

const barColor = computed(() =>
  summary.value.regressions > 0
    ? "var(--color-fail)"
    : healthColor(summary.value.pass, summary.value.total, 0),
);

const baseRecording = computed(
  () => props.feature.recordings.find((recording) => recording.name === "base") ?? null,
);
const orderedRecordings = computed(() => [
  ...(baseRecording.value ? [baseRecording.value] : []),
  ...props.feature.recordings.filter((recording) => recording.name !== "base"),
]);

const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    {
      label: "Copy /gen-tests command",
      icon: "pi pi-copy",
      disabled: !baseRecording.value,
      command: () => emit("gen", props.feature.feature),
    },
    {
      label: "Record base flow",
      icon: "pi pi-video",
      disabled: props.running,
      command: () => emit("record", props.feature.feature, "base"),
    },
  ];
  if (baseRecording.value) {
    items.push({
      label: "View base recording",
      icon: "pi pi-eye",
      command: () => emit("viewRecording", baseRecording.value!.id),
    });
  }
  items.push({ separator: true });
  if (props.feature.registered) {
    items.push(
      {
        label: "Edit registration",
        icon: "pi pi-pencil",
        command: () => emit("edit", props.feature),
      },
      {
        label: "Remove feature",
        icon: "pi pi-trash",
        command: () => emit("removeFeature", props.feature.feature),
      },
    );
  }
  return items;
});

// ---- test-case selection -------------------------------------------------
const testsAllSelected = computed({
  get: () =>
    props.feature.tests.length > 0 && selectedTests.value.size === props.feature.tests.length,
  set: (on: boolean) => {
    selectedTests.value = on ? new Set(props.feature.tests.map((t) => t.testId)) : new Set();
  },
});

function toggleTest(testId: string) {
  const next = new Set(selectedTests.value);
  if (next.has(testId)) next.delete(testId);
  else next.add(testId);
  selectedTests.value = next;
}

function bulkDeleteTests() {
  const titles = props.feature.tests
    .filter((t) => selectedTests.value.has(t.testId))
    .map((t) => t.title);
  if (titles.length) emit("deleteTests", props.feature.feature, titles);
  selectedTests.value = new Set();
}

// ---- recording selection -------------------------------------------------
const recsAllSelected = computed({
  get: () =>
    orderedRecordings.value.length > 0 &&
    selectedRecs.value.size === orderedRecordings.value.length,
  set: (on: boolean) => {
    selectedRecs.value = on ? new Set(orderedRecordings.value.map((r) => r.id)) : new Set();
  },
});

function toggleRec(id: number) {
  const next = new Set(selectedRecs.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedRecs.value = next;
}

function bulkDeleteRecs() {
  const picked = orderedRecordings.value.filter((r) => selectedRecs.value.has(r.id));
  if (picked.length) emit("removeRecordings", picked);
  selectedRecs.value = new Set();
}

function recordNamed() {
  const name = draftName.value.trim();
  if (!name) return;
  emit("record", props.feature.feature, name);
  draftName.value = "";
}
</script>

<template>
  <section class="rise overflow-hidden rounded-md border border-line bg-card">
    <!-- collapsed row: identity · health · run · overflow -->
    <header class="flex items-center gap-3 px-4 py-3">
      <button
        class="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-ink-3 transition hover:text-accent"
        :aria-label="open ? 'Collapse' : 'Expand'"
        @click="open = !open"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4 transition-transform"
          :class="open ? 'rotate-90' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <span class="h-7 w-[3px] shrink-0" :style="{ backgroundColor: barColor }" />

      <button class="min-w-0 flex-1 text-left" @click="open = !open">
        <h3 class="truncate font-display text-base font-bold text-ink">{{ feature.feature }}</h3>
      </button>

      <span
        v-if="!baseRecording"
        class="shrink-0 rounded-sm border border-flaky/40 bg-flaky/10 px-1.5 py-0.5 font-mono text-[10px] text-flaky"
        v-tooltip.top="'Record a base flow before generating tests'"
      >
        ⚠ no base
      </span>

      <div class="tnum flex shrink-0 items-center gap-2 font-mono text-xs">
        <span v-if="summary.regressions" class="text-fail">▲ {{ summary.regressions }}</span>
        <span class="text-ink-3">{{ summary.pass }}/{{ summary.total }}</span>
      </div>

      <button
        class="shrink-0 rounded-sm border border-accent bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
        :disabled="running || !feature.tests.length"
        @click="emit('run', feature.feature)"
      >
        ▶ run
      </button>

      <Button
        icon="pi pi-ellipsis-v"
        text
        rounded
        size="small"
        severity="secondary"
        aria-label="More actions"
        @click="menu?.toggle($event)"
      />
      <Menu ref="menu" :model="menuItems" popup />
    </header>

    <div v-if="open" class="border-t border-line">
      <!-- TEST CASES (collapsible + multi-select) -->
      <section>
        <header class="flex items-center gap-2 px-4 py-2">
          <button
            class="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-ink-3 transition hover:text-accent"
            :aria-label="testsOpen ? 'Collapse test cases' : 'Expand test cases'"
            @click="testsOpen = !testsOpen"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 transition-transform"
              :class="testsOpen ? 'rotate-90' : ''"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="label text-ink-3">test cases</span>
          <span class="tnum font-mono text-[11px] text-ink-3">{{ feature.tests.length }}</span>
          <Checkbox
            v-if="feature.tests.length"
            v-model="testsAllSelected"
            binary
            class="ml-1"
            v-tooltip.top="'Select all'"
            aria-label="Select all test cases"
          />

          <div v-if="selectedTests.size" class="ml-auto flex items-center gap-3">
            <span class="font-mono text-[11px] text-ink-3">{{ selectedTests.size }} selected</span>
            <button
              class="rounded-sm border border-fail/50 px-2 py-1 font-mono text-[11px] text-fail transition hover:bg-fail/10 disabled:opacity-40"
              :disabled="running"
              @click="bulkDeleteTests"
            >
              Delete selected
            </button>
            <button
              class="font-mono text-[11px] text-ink-3 transition hover:text-ink"
              @click="selectedTests = new Set()"
            >
              Clear
            </button>
          </div>
        </header>

        <ul v-if="testsOpen && feature.tests.length" class="border-t border-line">
          <li
            v-for="t in feature.tests"
            :key="t.testId"
            class="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
            :class="[
              isRegression({ status: statusOf(t.title, t.status), baseline: t.baseline }) ? 'bg-fail/8' : '',
              activeTitle === t.title ? 'tick-flash' : '',
              selectedTests.has(t.testId) ? 'bg-accent/8' : '',
            ]"
          >
            <Checkbox
              :model-value="selectedTests.has(t.testId)"
              binary
              :aria-label="`Select ${t.title}`"
              @update:model-value="toggleTest(t.testId)"
            />

            <span
              class="grid h-4 w-4 shrink-0 place-items-center text-xs"
              :class="statusOf(t.title, t.status) === 'running' ? 'pulse rounded-full' : ''"
              :style="{ color: look(statusOf(t.title, t.status)).color }"
            >
              {{ look(statusOf(t.title, t.status)).glyph }}
            </span>

            <span
              v-if="t.tcId"
              class="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-accent"
              >{{ t.tcId }}</span
            >

            <span class="min-w-0 flex-1 truncate text-ink">{{ t.title }}</span>

            <span
              v-if="t.flaky"
              class="shrink-0 rounded-sm bg-flaky/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-flaky"
              v-tooltip.top="'Recent results flip between pass and fail — failures are quarantined from the regression gate'"
              >FLAKY</span
            >

            <span
              v-if="isRegression({ status: statusOf(t.title, t.status), baseline: t.baseline })"
              class="shrink-0 rounded-sm bg-fail/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fail"
              >REGRESSION</span
            >

            <HistorySparkline v-if="t.history.length > 1" class="shrink-0" :history="t.history" />

            <span v-if="t.durationMs != null" class="tnum shrink-0 font-mono text-[11px] text-ink-3">
              {{ (t.durationMs / 1000).toFixed(1) }}s
            </span>

            <button
              v-if="t.tracePath && artifactKind(t.tracePath) === 'trace'"
              class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
              @click="emit('trace', t.tracePath!)"
            >
              trace ↗
            </button>
            <a
              v-else-if="t.tracePath"
              :href="artifactUrl(t.tracePath)"
              target="_blank"
              rel="noreferrer"
              class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
            >
              {{ artifactLabel(t.tracePath) }}
            </a>

            <a
              v-if="t.videoPath"
              :href="artifactUrl(t.videoPath)"
              target="_blank"
              rel="noreferrer"
              class="shrink-0 font-mono text-[11px] text-ink-2 underline-offset-2 transition hover:text-accent hover:underline"
              v-tooltip.top="'Watch the recorded test steps'"
            >
              video ↗
            </a>

            <label
              class="flex shrink-0 cursor-pointer items-center gap-1 font-mono text-[11px] transition"
              :class="recordsVideo(t.testId) ? 'text-accent' : 'text-ink-3 hover:text-accent'"
              v-tooltip.top="'Record a video of this test case on the next run'"
            >
              <Checkbox
                :model-value="recordsVideo(t.testId)"
                binary
                :aria-label="`Record video for ${t.title}`"
                @update:model-value="emit('toggleVideo', t.testId)"
              />
              <i class="pi pi-video text-[11px]" />
            </label>

            <button
              class="shrink-0 font-mono text-[11px] text-ink-3 transition hover:text-fail disabled:cursor-not-allowed disabled:opacity-40"
              title="Delete this test case from the spec file"
              :disabled="running"
              :aria-label="`Delete ${t.title}`"
              @click="emit('deleteTest', feature.feature, t.title)"
            >
              ✕
            </button>
          </li>
        </ul>
        <p
          v-else-if="testsOpen"
          class="border-t border-line px-4 py-4 text-center text-xs text-ink-3"
        >
          <template v-if="baseRecording">
            No tests generated yet —
            <button class="text-accent hover:underline" @click="emit('gen', feature.feature)">
              copy the /gen-tests command
            </button>
          </template>
          <template v-else>No tests generated yet — record a base flow first, then generate.</template>
        </p>
      </section>

      <!-- RECORDINGS (collapsible + multi-select) -->
      <section class="border-t border-line-strong bg-sunken">
        <header class="flex items-center gap-2 px-4 py-2">
          <button
            class="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-ink-3 transition hover:text-accent"
            :aria-label="recordingsOpen ? 'Collapse recordings' : 'Expand recordings'"
            @click="recordingsOpen = !recordingsOpen"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 transition-transform"
              :class="recordingsOpen ? 'rotate-90' : ''"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="label text-ink-3">recordings</span>
          <span class="tnum font-mono text-[11px] text-ink-3">{{ orderedRecordings.length }}</span>
          <Checkbox
            v-if="orderedRecordings.length"
            v-model="recsAllSelected"
            binary
            class="ml-1"
            v-tooltip.top="'Select all'"
            aria-label="Select all recordings"
          />

          <div v-if="selectedRecs.size" class="flex items-center gap-3">
            <span class="font-mono text-[11px] text-ink-3">{{ selectedRecs.size }} selected</span>
            <button
              class="rounded-sm border border-fail/50 px-2 py-1 font-mono text-[11px] text-fail transition hover:bg-fail/10 disabled:opacity-40"
              :disabled="running"
              @click="bulkDeleteRecs"
            >
              Delete selected
            </button>
            <button
              class="font-mono text-[11px] text-ink-3 transition hover:text-ink"
              @click="selectedRecs = new Set()"
            >
              Clear
            </button>
          </div>

          <Button
            class="ml-auto"
            label="Record base"
            icon="pi pi-video"
            size="small"
            severity="secondary"
            outlined
            :disabled="running"
            @click="emit('record', feature.feature, 'base')"
          />
        </header>

        <div v-if="recordingsOpen" class="border-t border-line px-4 py-3">
          <ul v-if="orderedRecordings.length" class="grid gap-2">
            <li
              v-for="recording in orderedRecordings"
              :key="recording.id"
              class="flex items-center gap-2 rounded-md border border-line bg-card px-3 py-2"
              :class="selectedRecs.has(recording.id) ? 'border-accent/50 bg-accent/8' : ''"
            >
              <Checkbox
                :model-value="selectedRecs.has(recording.id)"
                binary
                :aria-label="`Select ${recording.name}`"
                @update:model-value="toggleRec(recording.id)"
              />
              <span class="w-24 shrink-0 truncate font-mono text-xs text-ink">{{ recording.name }}</span>
              <span
                v-if="recording.isPrimary"
                class="shrink-0 rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent"
                >base</span
              >
              <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{{ recording.path }}</span>
              <Button
                icon="pi pi-eye"
                text
                rounded
                size="small"
                severity="secondary"
                :aria-label="`View ${recording.name}`"
                v-tooltip.top="'View source'"
                @click="emit('viewRecording', recording.id)"
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
                :disabled="running"
                :aria-label="`Delete ${recording.name}`"
                v-tooltip.top="'Delete recording'"
                @click="emit('removeRecording', recording)"
              />
            </li>
          </ul>
          <p v-else class="rounded-md border border-dashed border-line px-3 py-3 text-center text-xs text-ink-3">
            No recordings yet — record a base flow to enable test generation.
          </p>

          <div class="mt-3 flex items-center gap-2">
            <InputText
              v-model="draftName"
              size="small"
              class="min-w-0 flex-1 font-mono text-xs"
              placeholder="named flow"
              @keydown.enter="recordNamed"
            />
            <Button
              label="Record named"
              icon="pi pi-plus"
              size="small"
              severity="secondary"
              :disabled="running || !draftName.trim()"
              @click="recordNamed"
            />
          </div>
        </div>
      </section>

      <!-- metadata chips -->
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <!-- sheet -->
        <a
          v-if="sheetUrl"
          :href="sheetUrl"
          target="_blank"
          rel="noreferrer"
          class="flex items-center gap-1.5 rounded-sm border border-line-strong bg-card px-2 py-1 font-mono text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
          v-tooltip.top="'Open linked Google Sheet'"
        >
          <i class="pi pi-table text-[11px]" />
          <span class="max-w-40 truncate">{{ feature.sheetId }}</span>
          <i class="pi pi-external-link text-[10px] opacity-70" />
        </a>
        <span
          v-else
          class="flex items-center gap-1.5 rounded-sm border border-line bg-card px-2 py-1 font-mono text-[11px] text-flaky"
          v-tooltip.top="'No Google Sheet linked — edit the feature to add one'"
        >
          <i class="pi pi-table text-[11px]" />
          no sheet
        </span>

        <!-- start path -->
        <span
          class="flex items-center gap-1.5 rounded-sm border border-line-strong bg-card px-2 py-1 font-mono text-[11px] text-ink-2"
          v-tooltip.top="'Recording / run start path'"
        >
          <i class="pi pi-compass text-[11px] text-ink-3" />
          <span class="max-w-56 truncate">{{ feature.startPath }}</span>
        </span>

        <!-- auth requirement -->
        <span
          class="flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px]"
          :class="
            feature.requiresAuth
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-line-strong bg-card text-ink-2'
          "
          v-tooltip.top="feature.requiresAuth ? 'Auth session required to run' : 'Runs without auth'"
        >
          <i :class="feature.requiresAuth ? 'pi pi-lock' : 'pi pi-unlock'" class="text-[11px]" />
          {{ feature.requiresAuth ? "auth required" : "public" }}
        </span>
      </div>
    </div>
  </section>
</template>
