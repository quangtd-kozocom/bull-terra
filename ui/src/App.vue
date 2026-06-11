<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "./api";
import type { ProjectView } from "./types";
import { useRun } from "./composables/useRun";
import Sidebar from "./components/Sidebar.vue";
import FeatureCard from "./components/FeatureCard.vue";
import RunConsole from "./components/RunConsole.vue";
import AddProjectModal from "./components/AddProjectModal.vue";

const projects = ref<ProjectView[]>([]);
const selectedName = ref<string | null>(null);
const showAdd = ref(false);
const toast = ref("");
const recording = ref(false);
const { state: run, start, stop } = useRun();

const selected = computed(() => projects.value.find((p) => p.name === selectedName.value) ?? null);

function flash(msg: string) {
  toast.value = msg;
  setTimeout(() => (toast.value = ""), 2600);
}

async function load(keepSelection = true) {
  projects.value = await api.listProjects();
  if (!keepSelection || !selectedName.value) selectedName.value = projects.value[0]?.name ?? null;
}
onMounted(() => load());

async function refreshSelected() {
  if (!selectedName.value) return;
  const fresh = await api.getProject(selectedName.value);
  const i = projects.value.findIndex((p) => p.name === fresh.name);
  if (i >= 0) projects.value[i] = fresh;
}

// ── run (live SSE) ─────────────────────────────────────────────────────────
function runFeature(feature: string | undefined) {
  if (!selected.value || run.running) return;
  const titles = selected.value.features
    .filter((f) => !feature || f.feature === feature)
    .flatMap((f) => f.tests.map((t) => t.title));
  start(selected.value.name, feature, titles, refreshSelected);
}

async function stopRun() {
  await api.stopRun().catch(() => {});
  stop();
}

// ── actions ────────────────────────────────────────────────────────────────
async function copyGen(feature: string) {
  if (!selected.value) return;
  const { command } = await api.genCommand(selected.value.name, feature);
  try {
    await navigator.clipboard.writeText(command);
    flash(`Copied: ${command}`);
  } catch {
    flash(command);
  }
}

async function record() {
  if (!selected.value || recording.value) return;
  recording.value = true;
  flash("Recording… a browser opened. Close it when done.");
  try {
    await api.record(selected.value.name, {});
    await refreshSelected();
    flash("Recording saved & registered.");
  } catch (e) {
    flash(`Record failed: ${(e as Error).message}`);
  } finally {
    recording.value = false;
  }
}

async function createProject(body: { name: string; url: string; sheetId?: string }) {
  try {
    await api.addProject(body);
    showAdd.value = false;
    await load(false);
    selectedName.value = body.name;
  } catch (e) {
    flash(`Could not register: ${(e as Error).message}`);
  }
}

async function showTrace(path: string) {
  await api.showTrace(path).catch((e) => flash(`Trace: ${(e as Error).message}`));
  flash("Opening trace in the Playwright viewer…");
}
</script>

<template>
  <div class="flex h-full">
    <Sidebar
      :projects="projects"
      :selected="selectedName"
      @select="(n) => (selectedName = n)"
      @add="showAdd = true"
    />

    <main class="flex min-w-0 flex-1 flex-col">
      <template v-if="selected">
        <!-- project header + gauges -->
        <header class="border-b border-line px-7 py-5">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="font-display text-2xl font-extrabold text-parchment">{{ selected.name }}</h2>
              <a
                :href="selected.url"
                target="_blank"
                class="font-mono text-xs text-parchment-dim underline-offset-2 hover:text-amber hover:underline"
                >{{ selected.url }} ↗</a
              >
            </div>
            <div class="flex items-center gap-2">
              <button
                class="rounded-sm border border-line-2 px-3 py-1.5 text-xs text-parchment-dim transition hover:border-amber hover:text-amber disabled:opacity-40"
                :disabled="recording"
                @click="record"
              >
                {{ recording ? "● recording…" : "+ record base flow" }}
              </button>
              <button
                class="rounded-sm border border-amber/50 bg-amber/15 px-4 py-1.5 text-xs font-medium text-amber transition hover:bg-amber/25 disabled:opacity-40"
                :disabled="run.running || !selected.totals.tests"
                @click="runFeature(undefined)"
              >
                ▶ run all
              </button>
            </div>
          </div>

          <!-- gauges -->
          <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="g in [
                { k: 'tests', label: 'test cases', val: selected.totals.tests, color: '#d8ccb8' },
                { k: 'passed', label: 'passing', val: selected.totals.passed, color: '#74c365' },
                { k: 'failed', label: 'failing', val: selected.totals.failed, color: '#ef5b3c' },
                { k: 'never', label: 'not run', val: selected.totals.never, color: '#948872' },
              ]"
              :key="g.k"
              class="rounded-md border border-line bg-panel/50 px-4 py-3"
            >
              <div class="font-display text-3xl font-extrabold tabular-nums" :style="{ color: g.color }">
                {{ g.val }}
              </div>
              <div class="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-parchment-dim">
                {{ g.label }}
              </div>
            </div>
          </div>
        </header>

        <!-- body: features + console -->
        <div class="flex min-h-0 flex-1">
          <div class="flex-1 space-y-3 overflow-y-auto px-7 py-6">
            <FeatureCard
              v-for="f in selected.features"
              :key="f.feature"
              :feature="f"
              :live-status="run.liveStatus"
              :running="run.running"
              :active-title="run.active"
              @run="(name) => runFeature(name)"
              @gen="copyGen"
              @trace="showTrace"
            />

            <div
              v-if="!selected.features.length"
              class="rounded-md border border-dashed border-line-2 px-6 py-12 text-center"
            >
              <p class="font-display text-lg font-bold text-parchment">No generated specs yet</p>
              <p class="mx-auto mt-2 max-w-md text-sm text-parchment-dim">
                Record a base flow, then generate tests from your sheet with Claude Code. Copy the
                command:
              </p>
              <button
                class="mt-4 rounded-sm border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-xs text-amber transition hover:bg-amber/20"
                @click="copyGen('<feature>')"
              >
                claude "/gen-tests {{ selected.name }} &lt;feature&gt;"
              </button>
            </div>
          </div>

          <!-- live console -->
          <div class="hidden w-[420px] shrink-0 border-l border-line bg-soil-2/50 lg:block">
            <RunConsole :state="run" @stop="stopRun" />
          </div>
        </div>
      </template>

      <!-- empty state -->
      <div v-else class="grid flex-1 place-items-center px-8 text-center">
        <div>
          <h2 class="font-display text-2xl font-extrabold text-parchment">No project selected</h2>
          <p class="mx-auto mt-2 max-w-sm text-sm text-parchment-dim">
            Register a project to turn your Google Sheet test cases into live, regression-aware
            Playwright runs.
          </p>
          <button
            class="mt-5 rounded-sm border border-amber/50 bg-amber/15 px-5 py-2.5 text-sm font-medium text-amber transition hover:bg-amber/25"
            @click="showAdd = true"
          >
            + register a project
          </button>
        </div>
      </div>
    </main>

    <!-- toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line-2 bg-panel-2 px-4 py-2.5 font-mono text-xs text-parchment shadow-xl"
      >
        {{ toast }}
      </div>
    </Transition>

    <AddProjectModal v-if="showAdd" @close="showAdd = false" @create="createProject" />
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
