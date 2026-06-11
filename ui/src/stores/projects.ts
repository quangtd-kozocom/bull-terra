import { computed, shallowRef } from "vue";
import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { api } from "../api";
import type { EnvironmentInput, FeatureInput, NewEnvironment, ProjectView } from "../types";

export const useProjectsStore = defineStore("projects", () => {
  const projects = shallowRef<ProjectView[]>([]);
  const selectedName = useLocalStorage<string | null>("bull-terra:selected-project", null);
  const activeEnv = useLocalStorage<string | null>("bull-terra:active-env", null);
  const showSettings = useLocalStorage("bull-terra:show-settings", false);
  const loading = shallowRef(false);
  const saving = shallowRef(false);

  const selected = computed(
    () => projects.value.find((project) => project.name === selectedName.value) ?? null,
  );
  const hasEnv = computed(() => !!selected.value?.environments.length);
  const gauges = computed(() => {
    const totals = selected.value?.totals ?? { tests: 0, passed: 0, failed: 0, never: 0 };

    return [
      { label: "test cases", val: totals.tests, color: "var(--color-ink)" },
      { label: "passing", val: totals.passed, color: "var(--color-pass)" },
      { label: "failing", val: totals.failed, color: "var(--color-fail)" },
      { label: "not run", val: totals.never, color: "var(--color-ink-3)" },
    ];
  });

  function syncActiveEnv(project = selected.value) {
    if (!project) {
      activeEnv.value = null;
      showSettings.value = false;
      return;
    }

    if (!activeEnv.value || !project.environments.some((env) => env.name === activeEnv.value)) {
      activeEnv.value = project.activeEnv;
    }
  }

  function replaceProject(fresh: ProjectView) {
    const index = projects.value.findIndex((project) => project.name === fresh.name);
    projects.value =
      index >= 0
        ? projects.value.map((project, i) => (i === index ? fresh : project))
        : [...projects.value, fresh].sort((a, b) => a.name.localeCompare(b.name));

    if (fresh.name === selectedName.value) syncActiveEnv(fresh);
  }

  function replaceRenamedProject(oldName: string, fresh: ProjectView) {
    const exists = projects.value.some((project) => project.name === oldName);
    projects.value = exists
      ? projects.value
          .map((project) => (project.name === oldName ? fresh : project))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [...projects.value, fresh].sort((a, b) => a.name.localeCompare(b.name));
    selectedName.value = fresh.name;
    activeEnv.value = fresh.activeEnv;
  }

  async function loadProjects(keepSelection = true) {
    loading.value = true;
    try {
      projects.value = await api.listProjects();
      const stillExists = projects.value.some((project) => project.name === selectedName.value);
      if (!keepSelection || !selectedName.value || !stillExists) {
        selectedName.value = projects.value[0]?.name ?? null;
      }
      syncActiveEnv();
      if (selected.value && (!selected.value.environments.length || !selected.value.features.length)) {
        showSettings.value = true;
      }
    } finally {
      loading.value = false;
    }
  }

  async function refreshSelected() {
    if (!selectedName.value) return;
    replaceProject(await api.getProject(selectedName.value, activeEnv.value ?? undefined));
  }

  async function selectProject(name: string) {
    selectedName.value = name;
    syncActiveEnv();
    showSettings.value = selected.value
      ? !selected.value.environments.length || !selected.value.features.length
      : false;
  }

  async function selectEnv(env: string) {
    activeEnv.value = env;
    await refreshSelected();
  }

  async function createProject(name: string) {
    saving.value = true;
    try {
      const fresh = await api.addProject(name);
      replaceProject(fresh);
      selectedName.value = fresh.name;
      showSettings.value = true;
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function renameProject(name: string, nextName: string) {
    saving.value = true;
    try {
      const fresh = await api.updateProject(name, { name: nextName });
      replaceRenamedProject(name, fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function deleteProject(name: string) {
    saving.value = true;
    try {
      await api.removeProject(name);
      const wasSelected = selectedName.value === name;
      projects.value = projects.value.filter((project) => project.name !== name);
      if (wasSelected) {
        selectedName.value = projects.value[0]?.name ?? null;
        syncActiveEnv();
      }
    } finally {
      saving.value = false;
    }
  }

  async function addEnvironment(env: NewEnvironment) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.addEnvironment(selected.value.name, env);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function updateEnvironment(env: string, next: EnvironmentInput) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.updateEnvironment(selected.value.name, env, next);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function setDefaultEnvironment(env: string) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.setDefaultEnvironment(selected.value.name, env);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function deleteEnvironment(env: string) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.removeEnvironment(selected.value.name, env);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function addFeature(feature: FeatureInput) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.addFeature(selected.value.name, feature);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function updateFeature(feature: string, next: FeatureInput) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.updateFeature(selected.value.name, feature, next);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function deleteFeature(feature: string) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.removeFeature(selected.value.name, feature);
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function deleteTest(feature: string, title: string) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.removeTest(
        selected.value.name,
        feature,
        title,
        activeEnv.value ?? undefined,
      );
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  async function deleteRecording(recordingId: number) {
    if (!selected.value) return null;
    saving.value = true;
    try {
      const fresh = await api.removeRecording(
        selected.value.name,
        recordingId,
        activeEnv.value ?? undefined,
      );
      replaceProject(fresh);
      return fresh;
    } finally {
      saving.value = false;
    }
  }

  return {
    projects,
    selectedName,
    activeEnv,
    showSettings,
    loading,
    saving,
    selected,
    hasEnv,
    gauges,
    loadProjects,
    refreshSelected,
    selectProject,
    selectEnv,
    createProject,
    renameProject,
    deleteProject,
    addEnvironment,
    updateEnvironment,
    setDefaultEnvironment,
    deleteEnvironment,
    addFeature,
    updateFeature,
    deleteFeature,
    deleteTest,
    deleteRecording,
  };
});
