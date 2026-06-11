<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api } from "./api";
import type { NewEnvironment, ProjectView } from "./types";
import { useRun } from "./composables/useRun";
import Sidebar from "./components/Sidebar.vue";
import FeatureCard from "./components/FeatureCard.vue";
import RunConsole from "./components/RunConsole.vue";
import AddProjectModal from "./components/AddProjectModal.vue";
import EnvManager from "./components/EnvManager.vue";
import FeatureManager from "./components/FeatureManager.vue";

const projects = ref<ProjectView[]>([]);
const selectedName = ref<string | null>(null);
const activeEnv = ref<string | null>(null);
const showAdd = ref(false);
const showSettings = ref(false);
const toast = ref("");
const recording = ref(false);
const { state: run, start, stop } = useRun();

const selected = computed(() => projects.value.find((p) => p.name === selectedName.value) ?? null);
const hasEnv = computed(() => !!selected.value?.environments.length);

function flash(msg: string) {
  toast.value = msg;
  setTimeout(() => (toast.value = ""), 3200);
}

function replaceProject(fresh: ProjectView) {
  const i = projects.value.findIndex((p) => p.name === fresh.name);
  if (i >= 0) projects.value[i] = fresh;
  else projects.value.push(fresh);
  if (fresh.name === selectedName.value) activeEnv.value = fresh.activeEnv;
}

async function load(keepSelection = true) {
  projects.value = await api.listProjects();
  if (!keepSelection || !selectedName.value) selectedName.value = projects.value[0]?.name ?? null;
}
onMounted(() => load());

// When the selected project changes, sync the active env to its default.
watch(selected, (p) => {
  if (p && (!activeEnv.value || !p.environments.some((e) => e.name === activeEnv.value)))
    activeEnv.value = p.activeEnv;
  showSettings.value = p ? !p.environments.length || !p.features.length : false;
});

async function refreshSelected() {
  if (!selectedName.value) return;
  replaceProject(await api.getProject(selectedName.value, activeEnv.value ?? undefined));
}

async function selectEnv(env: string) {
  activeEnv.value = env;
  await refreshSelected();
}

// ── run (live SSE) ─────────────────────────────────────────────────────────
function runFeature(feature: string | undefined) {
  if (!selected.value || run.running) return;
  if (!hasEnv.value) {
    flash("Add an environment to run against first.");
    showSettings.value = true;
    return;
  }
  const titles = selected.value.features
    .filter((f) => !feature || f.feature === feature)
    .flatMap((f) => f.tests.map((t) => t.title));
  start(selected.value.name, feature, activeEnv.value ?? undefined, titles, refreshSelected);
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
  if (!hasEnv.value) {
    flash("Add an environment to record against first.");
    showSettings.value = true;
    return;
  }
  recording.value = true;
  flash("Recording… a browser should open. Close it when done.");
  try {
    await api.record(selected.value.name, { env: activeEnv.value ?? undefined });
    await refreshSelected();
    flash("Recording saved & registered.");
  } catch (e) {
    flash(`Record failed: ${(e as Error).message}`);
  } finally {
    recording.value = false;
  }
}

async function createProject(name: string) {
  try {
    await api.addProject(name);
    showAdd.value = false;
    await load(false);
    selectedName.value = name;
    showSettings.value = true;
  } catch (e) {
    flash(`Could not create: ${(e as Error).message}`);
  }
}

// ── env / feature management ─────────────────────────────────────────────────
const guard = (fn: () => Promise<ProjectView>) =>
  fn()
    .then(replaceProject)
    .catch((e) => flash((e as Error).message));

const addEnv = (env: NewEnvironment) =>
  selected.value && guard(() => api.addEnvironment(selected.value!.name, env));
const setDefaultEnv = (env: string) =>
  selected.value && guard(() => api.setDefaultEnvironment(selected.value!.name, env));
const removeEnv = (env: string) =>
  selected.value && guard(() => api.removeEnvironment(selected.value!.name, env));
const addFeature = (f: { name: string; sheetId?: string }) =>
  selected.value && guard(() => api.addFeature(selected.value!.name, f));
const removeFeature = (f: string) =>
  selected.value && guard(() => api.removeFeature(selected.value!.name, f));

async function showTrace(path: string) {
  await api.showTrace(path).catch((e) => flash(`Trace: ${(e as Error).message}`));
  flash("Opening trace in the Playwright viewer…");
}

const gauges = computed(() => {
  const t = selected.value?.totals ?? { tests: 0, passed: 0, failed: 0, never: 0 };
  return [
    { label: "test cases", val: t.tests, color: "var(--color-ink)" },
    { label: "passing", val: t.passed, color: "var(--color-pass)" },
    { label: "failing", val: t.failed, color: "var(--color-fail)" },
    { label: "not run", val: t.never, color: "var(--color-ink-3)" },
  ];
});
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
        <!-- project header -->
        <header class="border-b border-line px-7 py-5">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="flex items-end gap-4">
              <h2 class="font-display text-2xl font-extrabold text-ink">{{ selected.name }}</h2>

              <!-- environment selector (run target + view) -->
              <label v-if="hasEnv" class="flex items-center gap-2">
                <span class="label text-ink-3">env</span>
                <select
                  class="rounded-sm border border-line-strong bg-card px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
                  :value="activeEnv ?? ''"
                  @change="selectEnv(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="e in selected.environments" :key="e.id" :value="e.name">
                    {{ e.name }}{{ e.isDefault ? " ★" : "" }} — {{ e.url }}
                  </option>
                </select>
              </label>
              <span v-else class="text-xs text-flaky">no environments yet</span>
            </div>

            <div class="flex items-center gap-2">
              <button
                class="rounded-sm border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:border-accent hover:text-accent"
                :class="showSettings ? 'border-accent text-accent' : ''"
                @click="showSettings = !showSettings"
              >
                ⚙ manage
              </button>
              <button
                class="rounded-sm border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:border-accent hover:text-accent disabled:opacity-40"
                :disabled="recording"
                @click="record"
              >
                {{ recording ? "● recording…" : "+ record base flow" }}
              </button>
              <button
                class="rounded-sm border border-accent bg-accent/12 px-4 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
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
              v-for="g in gauges"
              :key="g.label"
              class="rounded-md border border-line bg-card px-4 py-3"
            >
              <div class="tnum font-display text-3xl font-extrabold" :style="{ color: g.color }">
                {{ g.val }}
              </div>
              <div class="label mt-0.5 text-ink-3">{{ g.label }}</div>
            </div>
          </div>
        </header>

        <!-- settings: environments + features -->
        <div v-if="showSettings" class="grid gap-3 border-b border-line px-7 py-5 lg:grid-cols-2">
          <EnvManager
            :environments="selected.environments"
            :active-env="activeEnv"
            @select="selectEnv"
            @set-default="setDefaultEnv"
            @remove="removeEnv"
            @add="addEnv"
          />
          <FeatureManager
            :features="selected.features"
            @add="addFeature"
            @remove="removeFeature"
          />
        </div>

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
              class="rounded-md border border-dashed border-line-strong px-6 py-12 text-center"
            >
              <p class="font-display text-lg font-bold text-ink">No features yet</p>
              <p class="mx-auto mt-2 max-w-md text-sm text-ink-2">
                Register a feature (one Google Sheet each), record a base flow, then generate
                tests with Claude Code.
              </p>
              <button
                class="mt-4 rounded-sm border border-accent bg-accent/10 px-4 py-2 text-xs font-medium text-accent transition hover:bg-accent/20"
                @click="showSettings = true"
              >
                ⚙ open manage panel
              </button>
            </div>
          </div>

          <!-- live console -->
          <div class="hidden w-[420px] shrink-0 border-l border-line bg-card lg:block">
            <RunConsole :state="run" @stop="stopRun" />
          </div>
        </div>
      </template>

      <!-- empty state -->
      <div v-else class="grid flex-1 place-items-center px-8 text-center">
        <div>
          <h2 class="font-display text-2xl font-extrabold text-ink">No project selected</h2>
          <p class="mx-auto mt-2 max-w-sm text-sm text-ink-2">
            Create a project, add its environments and features, and turn your Google Sheet test
            cases into live, regression-aware Playwright runs.
          </p>
          <button
            class="mt-5 rounded-sm border border-accent bg-accent/12 px-5 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/20"
            @click="showAdd = true"
          >
            + create a project
          </button>
        </div>
      </div>
    </main>

    <!-- toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line-strong bg-card px-4 py-2.5 font-mono text-xs text-ink shadow-xl"
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
