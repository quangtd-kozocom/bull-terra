<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import type {
    EnvironmentInput,
    EnvironmentView,
    NewEnvironment,
} from "../types";

const visible = defineModel<boolean>("visible", { required: true });

const props = defineProps<{
    mode: "create" | "edit";
    environment?: EnvironmentView | null;
    saving?: boolean;
}>();

const emit = defineEmits<{
    (e: "submit", value: NewEnvironment | EnvironmentInput): void;
}>();

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

interface VarRow {
    key: string;
    varName: string;
}

const form = reactive({ name: "", url: "https://", isDefault: false });
const rows = ref<VarRow[]>([]);
const error = shallowRef("");

const title = computed(() =>
    props.mode === "create"
        ? "Add environment"
        : `Edit ${props.environment?.name ?? "environment"}`,
);
const submitLabel = computed(() =>
    props.mode === "create" ? "Add environment" : "Save environment",
);

function rowsFrom(secretVars: Record<string, string> | undefined): VarRow[] {
    const entries = Object.entries(secretVars ?? {});
    if (entries.length)
        return entries.map(([key, varName]) => ({ key, varName }));
    // Sensible starter rows — USER/PASS is the common login case.
    return [
        { key: "USER", varName: "" },
        { key: "PASS", varName: "" },
    ];
}

watch(
    () => visible.value,
    (isVisible) => {
        if (!isVisible) return;
        form.name = props.environment?.name ?? "";
        form.url = props.environment?.url ?? "https://";
        form.isDefault = false;
        rows.value = rowsFrom(props.environment?.secretVars);
        error.value = "";
    },
);

function addRow() {
    rows.value.push({ key: "", varName: "" });
}

function removeRow(index: number) {
    rows.value.splice(index, 1);
}

/** Build + validate the KEY -> ENV_VAR_NAME map; returns null and sets `error` on a bad row. */
function buildSecretVars(): Record<string, string> | null {
    const map: Record<string, string> = {};
    for (const row of rows.value) {
        const rawKey = row.key.trim();
        const varName = row.varName.trim();
        if (!rawKey && !varName) continue; // skip a blank row
        const key = rawKey.toUpperCase();
        if (!KEY_RE.test(key)) {
            error.value = `Invalid key "${row.key}". Use A-Z, 0-9 and _ (e.g. USER, API_KEY).`;
            return null;
        }
        if (!varName) {
            error.value = `Enter the .env variable name for ${key}.`;
            return null;
        }
        if (map[key]) {
            error.value = `Duplicate key ${key}.`;
            return null;
        }
        map[key] = varName;
    }
    return map;
}

function submit() {
    if (!form.name.trim() || !form.url.trim()) {
        error.value = "Name and URL are required.";
        return;
    }
    const secretVars = buildSecretVars();
    if (secretVars === null) return;

    const payload: NewEnvironment = {
        name: form.name.trim(),
        url: form.url.trim(),
        secretVars,
    };
    if (props.mode === "create") payload.isDefault = form.isDefault;

    emit("submit", payload);
}
</script>

<template>
    <Dialog
        v-model:visible="visible"
        modal
        :header="title"
        :style="{ width: 'min(560px, calc(100vw - 32px))' }"
    >
        <form class="grid gap-4" @submit.prevent="submit">
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="grid gap-2">
                    <span class="label text-ink-3">name</span>
                    <InputText
                        v-model="form.name"
                        autofocus
                        class="w-full font-mono text-sm"
                        autocomplete="off"
                    />
                </label>
                <label class="grid gap-2">
                    <span class="label text-ink-3">url</span>
                    <InputText
                        v-model="form.url"
                        class="w-full font-mono text-sm"
                        autocomplete="off"
                    />
                </label>
            </div>

            <div class="grid gap-2">
                <div class="flex items-center justify-between">
                    <span class="label text-ink-3">secret vars</span>
                    <Button
                        label="Add var"
                        icon="pi pi-plus"
                        size="small"
                        severity="secondary"
                        text
                        @click="addRow"
                    />
                </div>

                <div
                    v-for="(row, i) in rows"
                    :key="i"
                    class="flex items-center gap-2"
                >
                    <InputText
                        v-model="row.key"
                        class="w-32 shrink-0 font-mono text-sm uppercase"
                        placeholder="KEY"
                        autocomplete="off"
                    />
                    <span class="text-ink-3">=</span>
                    <InputText
                        v-model="row.varName"
                        class="min-w-0 flex-1 font-mono text-sm"
                        placeholder="APP_STG_API_KEY"
                        autocomplete="off"
                    />
                    <Button
                        icon="pi pi-times"
                        text
                        rounded
                        size="small"
                        severity="secondary"
                        :aria-label="`Remove ${row.key || 'var'}`"
                        @click="removeRow(i)"
                    />
                </div>
                <p v-if="!rows.length" class="text-xs text-ink-3">
                    No secret vars — this environment runs unauthenticated.
                </p>
            </div>

            <label
                v-if="mode === 'create'"
                class="flex items-center gap-2 text-xs text-ink-2"
            >
                <Checkbox
                    v-model="form.isDefault"
                    binary
                    input-id="default-env"
                />
                <span>Set as default environment</span>
            </label>

            <p v-if="error" class="text-xs text-fail">{{ error }}</p>

            <footer class="flex justify-end gap-2">
                <Button
                    label="Cancel"
                    severity="secondary"
                    outlined
                    size="small"
                    @click="visible = false"
                />
                <Button
                    :label="submitLabel"
                    type="submit"
                    size="small"
                    :loading="saving"
                    :disabled="saving || !form.name.trim() || !form.url.trim()"
                />
            </footer>
        </form>
    </Dialog>
</template>
