<script setup lang="ts">
import { onMounted, shallowRef } from "vue";
import { storeToRefs } from "pinia";
import { useClipboard } from "@vueuse/core";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Select from "primevue/select";
import Toast from "primevue/toast";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { api } from "./api";
import type { EnvironmentInput, FeatureInput, NewEnvironment } from "./types";
import { useRun } from "./composables/useRun";
import { useProjectsStore } from "./stores/projects";
import Sidebar from "./components/Sidebar.vue";
import FeatureCard from "./components/FeatureCard.vue";
import RunConsole from "./components/RunConsole.vue";
import EnvManager from "./components/EnvManager.vue";
import FeatureManager from "./components/FeatureManager.vue";
import ProjectDialog from "./components/ProjectDialog.vue";

const projectsStore = useProjectsStore();
const { projects, selectedName, activeEnv, showSettings, saving, selected, hasEnv, gauges } =
  storeToRefs(projectsStore);
const { state: run, start, stop } = useRun();
const { copy } = useClipboard();
const confirm = useConfirm();
const toast = useToast();

const recording = shallowRef(false);
const projectDialogVisible = shallowRef(false);
const projectDialogMode = shallowRef<"create" | "rename">("create");
const editingProjectName = shallowRef("");

onMounted(() => {
  projectsStore.loadProjects().catch(showError);
});

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

function runFeature(feature: string | undefined) {
  if (!selected.value || run.running) return;
  if (!hasEnv.value) {
    showWarn("Add an environment first", "Runs need a target environment.");
    showSettings.value = true;
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
  try {
    const { command } = await api.genCommand(selected.value.name, feature);
    await copy(command);
    showSuccess("Generation command copied", command);
  } catch (error) {
    showError(error);
  }
}

async function record() {
  if (!selected.value || recording.value) return;
  if (!hasEnv.value) {
    showWarn("Add an environment first", "Recording needs a target environment.");
    showSettings.value = true;
    return;
  }

  recording.value = true;
  showWarn("Recording started", "A browser should open. Close it when done.");
  try {
    await api.record(selected.value.name, { env: activeEnv.value ?? undefined });
    await projectsStore.refreshSelected();
    showSuccess("Recording saved", "Base flow registered.");
  } catch (error) {
    showError(error);
  } finally {
    recording.value = false;
  }
}

const addEnv = (env: NewEnvironment) =>
  runAction(() => projectsStore.addEnvironment(env), "Environment added.");
const updateEnv = (env: string, next: EnvironmentInput) =>
  runAction(() => projectsStore.updateEnvironment(env, next), "Environment saved.");
const setDefaultEnv = (env: string) =>
  runAction(() => projectsStore.setDefaultEnvironment(env), "Default environment updated.");
const removeEnv = (env: string) =>
  runAction(() => projectsStore.deleteEnvironment(env), "Environment deleted.");
const addFeature = (feature: FeatureInput) =>
  runAction(() => projectsStore.addFeature(feature), "Feature added.");
const updateFeature = (feature: string, next: FeatureInput) =>
  runAction(() => projectsStore.updateFeature(feature, next), "Feature saved.");
const removeFeature = (feature: string) =>
  runAction(() => projectsStore.deleteFeature(feature), "Feature removed.");

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
        <header class="border-b border-line px-7 py-5">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="flex items-end gap-4">
              <h2 class="font-display text-2xl font-extrabold text-ink">{{ selected.name }}</h2>

              <label v-if="hasEnv" class="grid gap-1">
                <span class="label text-ink-3">env</span>
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

            <div class="flex items-center gap-2">
              <Button
                :label="showSettings ? 'Close manage' : 'Manage'"
                icon="pi pi-cog"
                size="small"
                severity="secondary"
                :outlined="!showSettings"
                @click="showSettings = !showSettings"
              />
              <Button
                :label="recording ? 'Recording...' : 'Record base flow'"
                :icon="recording ? 'pi pi-circle-fill' : 'pi pi-plus'"
                size="small"
                severity="secondary"
                :disabled="recording"
                @click="record"
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

          <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </header>

        <div v-if="showSettings" class="grid gap-3 border-b border-line px-7 py-5 lg:grid-cols-2">
          <EnvManager
            :environments="selected.environments"
            :active-env="activeEnv"
            :saving="saving"
            @select="projectsStore.selectEnv"
            @set-default="setDefaultEnv"
            @remove="removeEnv"
            @add="addEnv"
            @update="updateEnv"
          />
          <FeatureManager
            :features="selected.features"
            :saving="saving"
            @add="addFeature"
            @update="updateFeature"
            @remove="removeFeature"
          />
        </div>

        <div class="flex min-h-0 flex-1">
          <div class="flex-1 space-y-3 overflow-y-auto px-7 py-6">
            <FeatureCard
              v-for="feature in selected.features"
              :key="feature.feature"
              :feature="feature"
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
                Register a feature, link its Google Sheet, record a base flow, then generate tests.
              </p>
              <Button
                class="mt-4"
                label="Open manage"
                icon="pi pi-cog"
                size="small"
                @click="showSettings = true"
              />
            </div>
          </div>

          <div class="hidden w-[420px] shrink-0 border-l border-line bg-card lg:block">
            <RunConsole :state="run" @stop="stopRun" />
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

    <ProjectDialog
      v-model:visible="projectDialogVisible"
      :mode="projectDialogMode"
      :initial-name="editingProjectName"
      :saving="saving"
      @submit="submitProject"
    />
    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>
