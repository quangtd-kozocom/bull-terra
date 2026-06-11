<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from "vue";
import { storeToRefs } from "pinia";
import { useClipboard } from "@vueuse/core";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Drawer from "primevue/drawer";
import Select from "primevue/select";
import Toast from "primevue/toast";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { api } from "./api";
import type {
  AuthStateView,
  EnvironmentInput,
  EnvironmentView,
  FeatureInput,
  FeatureView,
  NewEnvironment,
  RecordingSourceView,
  RecordingView,
} from "./types";
import { useRun } from "./composables/useRun";
import { useProjectsStore } from "./stores/projects";
import Sidebar from "./components/Sidebar.vue";
import FeatureCard from "./components/FeatureCard.vue";
import EnvCard from "./components/EnvCard.vue";
import RunConsole from "./components/RunConsole.vue";
import ProjectDialog from "./components/ProjectDialog.vue";
import EnvironmentDialog from "./components/EnvironmentDialog.vue";
import FeatureDialog from "./components/FeatureDialog.vue";
import RecordingPreviewDialog from "./components/RecordingPreviewDialog.vue";
import AuthStateDialog from "./components/AuthStateDialog.vue";
import PromoteTestDialog from "./components/PromoteTestDialog.vue";

const projectsStore = useProjectsStore();
const { projects, selectedName, activeEnv, activeTab, saving, selected, hasEnv, gauges } =
  storeToRefs(projectsStore);
const { state: run, start, stop } = useRun();
const { copy } = useClipboard();
const confirm = useConfirm();
const toast = useToast();

const consoleOpen = shallowRef(false);
const recording = shallowRef(false);
const recordingPreviewVisible = shallowRef(false);
const recordingPreviewLoading = shallowRef(false);
const recordingPreview = shallowRef<RecordingSourceView | null>(null);
const recordingSaving = shallowRef(false);
const authStateVisible = shallowRef(false);
const authStateLoading = shallowRef(false);
const authState = shallowRef<AuthStateView | null>(null);
const projectDialogVisible = shallowRef(false);
const projectDialogMode = shallowRef<"create" | "rename">("create");
const editingProjectName = shallowRef("");
const envDialogVisible = shallowRef(false);
const envDialogMode = shallowRef<"create" | "edit">("create");
const editingEnv = shallowRef<EnvironmentView | null>(null);
const featureDialogVisible = shallowRef(false);
const featureDialogMode = shallowRef<"create" | "edit">("create");
const editingFeature = shallowRef<FeatureView | null>(null);
const capturingAuth = shallowRef<string | null>(null);
const promoteVisible = shallowRef(false);
const promoting = shallowRef(false);
const promoteTarget = shallowRef<RecordingView | null>(null);

/** The active run-target env — anchor the Environments tab compares against. */
const currentEnv = computed(
  () => selected.value?.environments.find((env) => env.name === activeEnv.value) ?? null,
);
/** Current env first, so it reads as the baseline at the top of the list. */
const orderedEnvs = computed(() =>
  [...(selected.value?.environments ?? [])].sort((a, b) =>
    a.name === activeEnv.value ? -1 : b.name === activeEnv.value ? 1 : 0,
  ),
);
const consoleDot = computed(() => {
  if (run.running) return "var(--color-accent)";
  if (run.finishedStatus === "passed") return "var(--color-pass)";
  if (run.finishedStatus) return "var(--color-fail)";
  return "var(--color-ink-3)";
});

onMounted(() => {
  projectsStore.loadProjects().catch(showError);
});

// The console slides in the moment a run starts, and stays until dismissed.
watch(
  () => run.running,
  (running) => {
    if (running) consoleOpen.value = true;
  },
);

function showSuccess(summary: string, detail?: string) {
  toast.add({ severity: "success", summary, detail, life: 2800 });
}

function showWarn(summary: string, detail?: string) {
  toast.add({ severity: "warn", summary, detail, life: 3200 });
}

function showError(error: unknown) {
  toast.add({
    severity: "error",
    summary: "Action failed",
    detail: error instanceof Error ? error.message : String(error),
    life: 4200,
  });
}

async function runAction(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    showSuccess(success);
  } catch (error) {
    showError(error);
  }
}

function openCreateProject() {
  projectDialogMode.value = "create";
  editingProjectName.value = "";
  projectDialogVisible.value = true;
}

function openRenameProject(name: string) {
  projectDialogMode.value = "rename";
  editingProjectName.value = name;
  projectDialogVisible.value = true;
}

async function submitProject(name: string) {
  try {
    if (projectDialogMode.value === "create") {
      await projectsStore.createProject(name);
      showSuccess("Project created", name);
    } else {
      await projectsStore.renameProject(editingProjectName.value, name);
      showSuccess("Project renamed", name);
    }
    projectDialogVisible.value = false;
  } catch (error) {
    showError(error);
  }
}

function confirmDeleteProject(name: string) {
  confirm.require({
    header: "Delete project",
    message: `Delete project "${name}" from bull-terra? Specs and recordings stay on disk.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete project",
    acceptClass: "p-button-danger",
    accept: () => runAction(() => projectsStore.deleteProject(name), `Deleted project ${name}.`),
  });
}

// ---- environments --------------------------------------------------------

function openCreateEnv() {
  envDialogMode.value = "create";
  editingEnv.value = null;
  envDialogVisible.value = true;
}

function openEditEnv(env: EnvironmentView) {
  envDialogMode.value = "edit";
  editingEnv.value = env;
  envDialogVisible.value = true;
}

function submitEnv(value: NewEnvironment | EnvironmentInput) {
  if (envDialogMode.value === "create") {
    runAction(() => projectsStore.addEnvironment(value as NewEnvironment), "Environment added.");
  } else if (editingEnv.value) {
    const name = editingEnv.value.name;
    runAction(() => projectsStore.updateEnvironment(name, value as EnvironmentInput), "Environment saved.");
  }
  envDialogVisible.value = false;
}

const setDefaultEnv = (env: string) =>
  runAction(() => projectsStore.setDefaultEnvironment(env), "Default environment updated.");
const removeEnv = (env: EnvironmentView) =>
  runAction(() => projectsStore.deleteEnvironment(env.name), "Environment deleted.");

async function captureAuth(env: string) {
  if (!selected.value || capturingAuth.value) return;
  capturingAuth.value = env;
  showWarn("Login browser opened", `Log in for ${env}, then close the browser to save the session.`);
  try {
    await api.captureAuth(selected.value.name, env);
    await projectsStore.refreshSelected();
    showSuccess("Auth session saved", `${env} can now record and run auth-required features.`);
  } catch (error) {
    showError(error);
  } finally {
    capturingAuth.value = null;
  }
}

// ---- features ------------------------------------------------------------

function openCreateFeature() {
  featureDialogMode.value = "create";
  editingFeature.value = null;
  featureDialogVisible.value = true;
}

function openEditFeature(feature: FeatureView) {
  featureDialogMode.value = "edit";
  editingFeature.value = feature;
  featureDialogVisible.value = true;
}

function submitFeature(value: FeatureInput) {
  if (featureDialogMode.value === "create") {
    runAction(() => projectsStore.addFeature(value), "Feature added.");
  } else if (editingFeature.value) {
    const name = editingFeature.value.feature;
    runAction(() => projectsStore.updateFeature(name, value), "Feature saved.");
  }
  featureDialogVisible.value = false;
}

function confirmDeleteFeature(feature: string) {
  confirm.require({
    header: "Remove feature",
    message: `Remove feature "${feature}" and its Google Sheet link? Generated specs stay on disk.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Remove feature",
    acceptClass: "p-button-danger",
    accept: () => runAction(() => projectsStore.deleteFeature(feature), `Removed ${feature}.`),
  });
}

function confirmDeleteTest(feature: string, title: string) {
  confirm.require({
    header: "Delete test case",
    message: `Delete "${title}" from ${feature}.spec.ts? This rewrites the spec file.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete test",
    acceptClass: "p-button-danger",
    accept: () =>
      runAction(() => projectsStore.deleteTest(feature, title), `Deleted ${title}.`),
  });
}

function confirmDeleteTests(feature: string, titles: string[]) {
  if (!titles.length) return;
  confirm.require({
    header: "Delete test cases",
    message: `Delete ${titles.length} test case${titles.length > 1 ? "s" : ""} from ${feature}.spec.ts? This rewrites the spec file.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete tests",
    acceptClass: "p-button-danger",
    accept: () =>
      runAction(
        () => projectsStore.deleteTests(feature, titles),
        `Deleted ${titles.length} test case${titles.length > 1 ? "s" : ""}.`,
      ),
  });
}

function confirmDeleteRecording(recording: RecordingView) {
  const scope = recording.feature ? `${recording.feature}/${recording.name}` : recording.name;
  confirm.require({
    header: "Delete recording",
    message: `Delete recording "${scope}"? The file moves to .history.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete recording",
    acceptClass: "p-button-danger",
    accept: () =>
      runAction(() => projectsStore.deleteRecording(recording.id), `Deleted recording ${scope}.`),
  });
}

function confirmDeleteRecordings(recordings: RecordingView[]) {
  if (!recordings.length) return;
  confirm.require({
    header: "Delete recordings",
    message: `Delete ${recordings.length} recording${recordings.length > 1 ? "s" : ""}? The files move to .history.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete recordings",
    acceptClass: "p-button-danger",
    accept: () =>
      runAction(
        () => projectsStore.deleteRecordings(recordings.map((r) => r.id)),
        `Deleted ${recordings.length} recording${recordings.length > 1 ? "s" : ""}.`,
      ),
  });
}

// ---- runs / recordings ---------------------------------------------------

function runFeature(feature: string | undefined) {
  if (!selected.value || run.running) return;
  if (!hasEnv.value) {
    showWarn("Add an environment first", "Runs need a target environment.");
    activeTab.value = "environments";
    return;
  }
  const titles = selected.value.features
    .filter((item) => !feature || item.feature === feature)
    .flatMap((item) => item.tests.map((test) => test.title));
  start(selected.value.name, feature, activeEnv.value ?? undefined, titles, projectsStore.refreshSelected);
}

async function stopRun() {
  await api.stopRun().catch(() => {});
  stop();
}

async function copyGen(feature: string) {
  if (!selected.value) return;
  const featureView = selected.value.features.find((item) => item.feature === feature);
  if (!featureView?.hasBaseRecording) {
    showWarn("Record base first", "Generation needs feature-scoped selectors.");
    return;
  }
  try {
    const { command } = await api.genCommand(selected.value.name, feature);
    await copy(command);
    showSuccess("Generation command copied", command);
  } catch (error) {
    showError(error);
  }
}

async function recordFeature(feature: string, name = "base") {
  if (!selected.value || recording.value) return;
  if (!hasEnv.value) {
    showWarn("Add an environment first", "Recording needs a target environment.");
    activeTab.value = "environments";
    return;
  }

  recording.value = true;
  showWarn("Recording started", `A browser should open for ${feature}/${name}. Close it when done.`);
  try {
    await api.recordFeature(selected.value.name, feature, { name, env: activeEnv.value ?? undefined });
    await projectsStore.refreshSelected();
    showSuccess("Recording saved", `${feature}/${name} registered.`);
  } catch (error) {
    showError(error);
  } finally {
    recording.value = false;
  }
}

async function viewRecording(recordingId: number) {
  if (!selected.value) return;
  recordingPreviewVisible.value = true;
  recordingPreviewLoading.value = true;
  recordingPreview.value = null;
  try {
    recordingPreview.value = await api.getRecording(selected.value.name, recordingId);
  } catch (error) {
    recordingPreviewVisible.value = false;
    showError(error);
  } finally {
    recordingPreviewLoading.value = false;
  }
}

async function saveRecording(recordingId: number, source: string) {
  if (!selected.value || recordingSaving.value) return;
  recordingSaving.value = true;
  try {
    recordingPreview.value = await api.saveRecording(selected.value.name, recordingId, source);
    await projectsStore.refreshSelected();
    showSuccess("Recording saved", "Edits written to disk.");
  } catch (error) {
    showError(error);
  } finally {
    recordingSaving.value = false;
  }
}

async function viewAuthState(env: string) {
  if (!selected.value) return;
  authStateVisible.value = true;
  authStateLoading.value = true;
  authState.value = null;
  try {
    authState.value = await api.getAuthState(selected.value.name, env);
  } catch (error) {
    authStateVisible.value = false;
    showError(error);
  } finally {
    authStateLoading.value = false;
  }
}

async function openSpec(specRelPath: string) {
  // specRelPath is "<project>/<feature>.spec.ts", rooted under tests/gen.
  try {
    await api.openFile(`tests/gen/${specRelPath}`);
  } catch (error) {
    showError(error);
  }
}

function openPromote(recordingId: number) {
  if (!selected.value) return;
  const target = selected.value.recordings.find((item) => item.id === recordingId);
  if (!target) return;
  promoteTarget.value = target;
  promoteVisible.value = true;
}

async function submitPromote(value: { tcId: string; title: string }) {
  if (!selected.value || !promoteTarget.value || promoting.value) return;
  promoting.value = true;
  try {
    const result = await api.promoteRecording(selected.value.name, promoteTarget.value.id, value);
    await projectsStore.refreshSelected();
    promoteVisible.value = false;
    showSuccess("Manual test created", `${result.tcId} added to ${result.feature}.spec.ts (TODO assertion).`);
  } catch (error) {
    showError(error);
  } finally {
    promoting.value = false;
  }
}

async function showTrace(path: string) {
  try {
    await api.showTrace(path);
    showSuccess("Opening trace", "Playwright trace viewer launched.");
  } catch (error) {
    showError(error);
  }
}
</script>

<template>
  <div class="flex h-full">
    <Sidebar
      :projects="projects"
      :selected="selectedName"
      @select="projectsStore.selectProject"
      @add="openCreateProject"
      @rename="openRenameProject"
      @remove="confirmDeleteProject"
    />

    <main class="flex min-w-0 flex-1 flex-col">
      <template v-if="selected">
        <header class="border-b border-line px-7 pt-5">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-4">
              <h2 class="font-display text-2xl font-extrabold text-ink">{{ selected.name }}</h2>

              <label v-if="hasEnv" class="flex items-center gap-2">
                <span class="label text-ink-3">current env</span>
                <Select
                  :model-value="activeEnv"
                  :options="selected.environments"
                  option-label="name"
                  option-value="name"
                  class="min-w-56 font-mono text-xs"
                  @update:model-value="projectsStore.selectEnv"
                >
                  <template #option="{ option }">
                    <div class="grid min-w-0">
                      <span class="font-display text-sm font-bold">{{ option.name }}</span>
                      <span class="truncate font-mono text-[11px] text-ink-3">{{ option.url }}</span>
                    </div>
                  </template>
                </Select>
              </label>
              <span v-else class="text-xs text-flaky">no environments yet</span>
            </div>

            <button
              class="flex items-center gap-2 rounded-sm border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] text-ink-2 shadow-sm transition hover:border-accent hover:text-accent"
              @click="consoleOpen = !consoleOpen"
            >
              <span
                class="h-2 w-2 rounded-full"
                :class="run.running ? 'pulse' : ''"
                :style="{ backgroundColor: consoleDot }"
              />
              console
            </button>
          </div>

          <!-- tabs -->
          <nav class="-mb-px mt-5 flex gap-6">
            <button
              v-for="tab in (['run', 'environments'] as const)"
              :key="tab"
              class="label border-b-2 pb-3 transition"
              :class="
                activeTab === tab
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-2 hover:text-ink'
              "
              @click="activeTab = tab"
            >
              {{ tab }}
            </button>
          </nav>
        </header>

        <!-- RUN TAB -->
        <div v-if="activeTab === 'run'" class="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="gauge in gauges"
              :key="gauge.label"
              class="rounded-md border border-line bg-card px-4 py-3"
            >
              <div class="tnum font-display text-3xl font-extrabold" :style="{ color: gauge.color }">
                {{ gauge.val }}
              </div>
              <div class="label mt-0.5 text-ink-3">{{ gauge.label }}</div>
            </div>
          </div>

          <div class="mb-3 mt-6 flex items-center justify-between">
            <span class="label text-ink-3">features</span>
            <div class="flex items-center gap-2">
              <Button
                label="Add feature"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                outlined
                @click="openCreateFeature"
              />
              <Button
                label="Run all"
                icon="pi pi-play"
                size="small"
                :disabled="run.running || !selected.totals.tests"
                @click="runFeature(undefined)"
              />
            </div>
          </div>

          <div class="space-y-3">
            <FeatureCard
              v-for="feature in selected.features"
              :key="feature.feature"
              :feature="feature"
              :live-status="run.liveStatus"
              :running="run.running"
              :active-title="run.active"
              @run="(name) => runFeature(name)"
              @gen="copyGen"
              @record="(name, recName) => recordFeature(name, recName)"
              @view-recording="viewRecording"
              @promote="openPromote"
              @remove-recording="confirmDeleteRecording"
              @remove-recordings="confirmDeleteRecordings"
              @edit="openEditFeature"
              @remove-feature="confirmDeleteFeature"
              @trace="showTrace"
              @delete-test="confirmDeleteTest"
              @delete-tests="confirmDeleteTests"
              @open-spec="openSpec"
            />

            <div
              v-if="!selected.features.length"
              class="rounded-md border border-dashed border-line-strong px-6 py-12 text-center"
            >
              <p class="font-display text-lg font-bold text-ink">No features yet</p>
              <p class="mx-auto mt-2 max-w-md text-sm text-ink-2">
                Register a feature, link its Google Sheet, record a base flow, then generate tests.
              </p>
              <Button
                class="mt-4"
                label="Add feature"
                icon="pi pi-plus"
                size="small"
                @click="openCreateFeature"
              />
            </div>
          </div>
        </div>

        <!-- ENVIRONMENTS TAB -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <div class="mb-3 flex items-center justify-between">
            <span class="label text-ink-3">environments · compared to current</span>
            <Button
              label="Add environment"
              icon="pi pi-plus"
              size="small"
              severity="secondary"
              outlined
              @click="openCreateEnv"
            />
          </div>

          <div class="grid gap-3 xl:grid-cols-2">
            <EnvCard
              v-for="env in orderedEnvs"
              :key="env.id"
              :env="env"
              :current="currentEnv"
              :is-active="env.name === activeEnv"
              :saving="saving"
              :capturing="capturingAuth === env.name"
              @select="projectsStore.selectEnv"
              @set-default="setDefaultEnv"
              @edit="openEditEnv"
              @remove="removeEnv"
              @capture-auth="captureAuth"
              @view-auth="viewAuthState"
            />

            <div
              v-if="!selected.environments.length"
              class="rounded-md border border-dashed border-line-strong px-6 py-12 text-center xl:col-span-2"
            >
              <p class="font-display text-lg font-bold text-ink">No environments yet</p>
              <p class="mx-auto mt-2 max-w-md text-sm text-ink-2">
                Add your local / dev / stg targets. The active one is the run target and the
                baseline every other env is compared against.
              </p>
              <Button
                class="mt-4"
                label="Add environment"
                icon="pi pi-plus"
                size="small"
                @click="openCreateEnv"
              />
            </div>
          </div>
        </div>
      </template>

      <div v-else class="grid flex-1 place-items-center px-8 text-center">
        <div>
          <h2 class="font-display text-2xl font-extrabold text-ink">No project selected</h2>
          <p class="mx-auto mt-2 max-w-sm text-sm text-ink-2">
            Create a project, add environments and features, then run Google Sheet test cases.
          </p>
          <Button
            class="mt-5"
            label="Create project"
            icon="pi pi-plus"
            size="small"
            @click="openCreateProject"
          />
        </div>
      </div>
    </main>

    <Drawer
      v-model:visible="consoleOpen"
      position="right"
      header="run console"
      :modal="false"
      :style="{ width: '460px', maxWidth: '92vw' }"
      :pt="{ content: { class: '!p-0 flex min-h-0 flex-1 flex-col' } }"
    >
      <RunConsole :state="run" @stop="stopRun" />
    </Drawer>

    <ProjectDialog
      v-model:visible="projectDialogVisible"
      :mode="projectDialogMode"
      :initial-name="editingProjectName"
      :saving="saving"
      @submit="submitProject"
    />
    <EnvironmentDialog
      v-model:visible="envDialogVisible"
      :mode="envDialogMode"
      :environment="editingEnv"
      :saving="saving"
      @submit="submitEnv"
    />
    <FeatureDialog
      v-model:visible="featureDialogVisible"
      :mode="featureDialogMode"
      :feature="editingFeature"
      :saving="saving"
      @submit="submitFeature"
    />
    <RecordingPreviewDialog
      v-model:visible="recordingPreviewVisible"
      :recording="recordingPreview"
      :loading="recordingPreviewLoading"
      :saving="recordingSaving"
      @save="saveRecording"
    />
    <AuthStateDialog
      v-model:visible="authStateVisible"
      :state="authState"
      :loading="authStateLoading"
    />
    <PromoteTestDialog
      v-model:visible="promoteVisible"
      :recording="promoteTarget"
      :saving="promoting"
      @submit="submitPromote"
    />
    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>
