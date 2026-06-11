<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import type { EnvironmentView } from "../types";
import { healthColor } from "../lib/status";

const props = defineProps<{
  env: EnvironmentView;
  /** The active run-target env — the anchor every other card compares against. */
  current: EnvironmentView | null;
  isActive: boolean;
  saving?: boolean;
  capturing?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", env: string): void;
  (e: "setDefault", env: string): void;
  (e: "edit", env: EnvironmentView): void;
  (e: "remove", env: EnvironmentView): void;
  (e: "captureAuth", env: string): void;
  (e: "viewAuth", env: string): void;
}>();

const confirm = useConfirm();

const healthDot = computed(() =>
  healthColor(props.env.health.passed, props.env.health.total, props.env.health.failed),
);

const urlDiffers = computed(
  () => !props.isActive && !!props.current && props.env.url !== props.current.url,
);

/** Secret keys grouped relative to the current env: shared / extra (only here) / missing (only on current). */
const keyDiff = computed(() => {
  const mine = Object.keys(props.env.secretVars);
  if (props.isActive || !props.current) {
    return { shared: mine, extra: [] as string[], missing: [] as string[] };
  }
  const theirs = new Set(Object.keys(props.current.secretVars));
  const mineSet = new Set(mine);
  return {
    shared: mine.filter((k) => theirs.has(k)),
    extra: mine.filter((k) => !theirs.has(k)),
    missing: Object.keys(props.current.secretVars).filter((k) => !mineSet.has(k)),
  };
});

const passDelta = computed(() =>
  props.isActive || !props.current ? 0 : props.env.health.passed - props.current.health.passed,
);
const regrDelta = computed(() =>
  props.isActive || !props.current
    ? 0
    : props.env.health.regressions - props.current.health.regressions,
);

function timeAgo(iso: string | null): string {
  if (!iso) return "never run";
  const then = new Date(iso.includes("Z") || iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (secs < 90) return "just now";
  const mins = secs / 60;
  if (mins < 90) return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 36) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function confirmRemove() {
  confirm.require({
    header: "Delete environment",
    message: `Delete environment "${props.env.name}"? Run history stays recorded.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete environment",
    acceptClass: "p-button-danger",
    accept: () => emit("remove", props.env),
  });
}
</script>

<template>
  <section
    class="rise overflow-hidden rounded-md border bg-card"
    :class="isActive ? 'border-accent' : 'border-line'"
  >
    <!-- identity -->
    <header class="flex items-center gap-3 px-4 py-3">
      <span class="h-7 w-[3px] shrink-0" :style="{ backgroundColor: healthDot }" />

      <button class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="emit('select', env.name)">
        <span class="truncate font-display text-base font-bold text-ink">{{ env.name }}</span>
        <span
          v-if="isActive"
          class="shrink-0 rounded-sm border border-accent bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent"
        >
          current
        </span>
        <span v-else class="shrink-0 font-mono text-[10px] text-ink-3 hover:text-accent">
          set current
        </span>
      </button>

      <Button
        icon="pi pi-shield"
        text
        rounded
        size="small"
        severity="secondary"
        :disabled="!env.authStateExists"
        :aria-label="`View ${env.name} auth state`"
        v-tooltip.top="env.authStateExists ? 'View stored auth state' : 'No auth captured yet'"
        @click="emit('viewAuth', env.name)"
      />
      <Button
        :icon="env.isDefault ? 'pi pi-star-fill' : 'pi pi-star'"
        text
        rounded
        size="small"
        :severity="env.isDefault ? 'info' : 'secondary'"
        :aria-label="env.isDefault ? 'Default environment' : `Set ${env.name} as default`"
        v-tooltip.top="env.isDefault ? 'Default environment' : 'Set as default'"
        @click="emit('setDefault', env.name)"
      />
      <Button
        icon="pi pi-pencil"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="`Edit ${env.name}`"
        v-tooltip.top="'Edit environment'"
        @click="emit('edit', env)"
      />
      <Button
        icon="pi pi-trash"
        text
        rounded
        size="small"
        severity="danger"
        :aria-label="`Delete ${env.name}`"
        v-tooltip.top="'Delete environment'"
        @click="confirmRemove"
      />
    </header>

    <!-- comparison body -->
    <div class="grid gap-3 border-t border-line px-4 py-3 text-sm">
      <!-- url -->
      <div class="flex items-baseline gap-2">
        <span class="label w-16 shrink-0 text-ink-3">url</span>
        <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">{{ env.url }}</span>
        <span
          v-if="urlDiffers"
          class="shrink-0 rounded-sm bg-flaky/12 px-1.5 py-0.5 font-mono text-[10px] text-flaky"
        >
          differs
        </span>
      </div>

      <!-- secret vars vs current -->
      <div class="flex items-baseline gap-2">
        <span class="label w-16 shrink-0 text-ink-3">secrets</span>
        <div class="flex min-w-0 flex-1 flex-wrap gap-1">
          <span
            v-for="key in keyDiff.shared"
            :key="`s-${key}`"
            class="rounded-sm border border-line bg-card-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
            v-tooltip.top="`$${env.secretVars[key]}`"
            >{{ key }}</span
          >
          <span
            v-for="key in keyDiff.extra"
            :key="`e-${key}`"
            class="rounded-sm border border-pass/40 bg-pass/10 px-1.5 py-0.5 font-mono text-[10px] text-pass"
            v-tooltip.top="`Only on this env · $${env.secretVars[key]}`"
            >+{{ key }}</span
          >
          <span
            v-for="key in keyDiff.missing"
            :key="`m-${key}`"
            class="rounded-sm border border-fail/40 bg-fail/10 px-1.5 py-0.5 font-mono text-[10px] text-fail"
            v-tooltip.top="`Set on current ($${current?.secretVars[key]}) but missing here`"
            >−{{ key }}</span
          >
          <span
            v-if="!keyDiff.shared.length && !keyDiff.extra.length && !keyDiff.missing.length"
            class="font-mono text-[11px] text-ink-3"
            >none</span
          >
        </div>
      </div>

      <!-- auth -->
      <div class="flex items-center gap-2">
        <span class="label w-16 shrink-0 text-ink-3">auth</span>
        <span
          class="shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]"
          :class="
            env.authStateExists
              ? 'border-pass/40 bg-pass/10 text-pass'
              : 'border-flaky/40 bg-flaky/10 text-flaky'
          "
        >
          {{ env.authStateExists ? "ready" : "missing" }}
        </span>
        <span v-if="env.authStateExists && env.authStateUpdatedAt" class="font-mono text-[11px] text-ink-3">
          {{ timeAgo(env.authStateUpdatedAt) }}
        </span>
        <Button
          class="ml-auto"
          label="Login once"
          icon="pi pi-key"
          size="small"
          severity="secondary"
          outlined
          :loading="capturing"
          :disabled="saving || capturing"
          @click="emit('captureAuth', env.name)"
        />
      </div>

      <!-- health vs current -->
      <div class="flex items-center gap-2 border-t border-line pt-3">
        <span class="label w-16 shrink-0 text-ink-3">health</span>
        <span class="tnum font-mono text-[12px]" :style="{ color: healthDot }">
          {{ env.health.passed }}/{{ env.health.total }}
        </span>
        <span v-if="env.health.regressions" class="tnum font-mono text-[11px] text-fail">
          ▲ {{ env.health.regressions }} regr
        </span>
        <span class="font-mono text-[11px] text-ink-3">· {{ timeAgo(env.health.lastRunAt) }}</span>

        <span v-if="!isActive && current" class="ml-auto flex items-center gap-2 font-mono text-[11px]">
          <span
            v-if="passDelta !== 0"
            :class="passDelta > 0 ? 'text-pass' : 'text-fail'"
            v-tooltip.top="'Passing vs current'"
          >
            {{ passDelta > 0 ? "+" : "" }}{{ passDelta }} pass
          </span>
          <span
            v-if="regrDelta !== 0"
            :class="regrDelta > 0 ? 'text-fail' : 'text-pass'"
            v-tooltip.top="'Regressions vs current'"
          >
            {{ regrDelta > 0 ? "+" : "" }}{{ regrDelta }} regr
          </span>
          <span v-if="passDelta === 0 && regrDelta === 0" class="text-ink-3">matches current</span>
        </span>
      </div>
    </div>
  </section>
</template>
