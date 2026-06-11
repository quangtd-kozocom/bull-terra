import { ref } from "vue";

export type ThemePref = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "bull-terra:theme";
const order: ThemePref[] = ["light", "dark", "auto"];

const media = window.matchMedia("(prefers-color-scheme: dark)");

function load(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "auto";
}

function systemTheme(): ResolvedTheme {
  return media.matches ? "dark" : "light";
}

/** Reactive theme preference; always applies a concrete light/dark to <html>. */
export const pref = ref<ThemePref>(load());
export const resolved = ref<ResolvedTheme>(pref.value === "auto" ? systemTheme() : pref.value);

function apply() {
  resolved.value = pref.value === "auto" ? systemTheme() : pref.value;
  document.documentElement.setAttribute("data-theme", resolved.value);
}

// Re-resolve when the OS theme changes and we're following it.
media.addEventListener("change", () => {
  if (pref.value === "auto") apply();
});

export function setTheme(next: ThemePref) {
  pref.value = next;
  localStorage.setItem(STORAGE_KEY, next);
  apply();
}

/** Cycle Light → Dark → Auto. */
export function cycleTheme() {
  setTheme(order[(order.indexOf(pref.value) + 1) % order.length]);
}

// Apply immediately on import so there's no flash of the wrong theme.
apply();
