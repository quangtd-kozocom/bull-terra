<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  type Completion,
  completeFromList,
  snippet,
  snippetCompletion,
} from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { PLAYWRIGHT_SNIPPETS } from "../lib/playwrightSnippets";

const props = withDefaults(
  defineProps<{
    language?: "typescript" | "json";
    readOnly?: boolean;
  }>(),
  { language: "typescript", readOnly: false },
);

const model = defineModel<string>({ default: "" });
const emit = defineEmits<{ (e: "save"): void }>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

// Colours come from CSS vars (see style.css) so the editor re-skins with the
// app's light/dark theme flip — no per-theme editor config needed.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier], color: "var(--cm-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--cm-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--cm-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--cm-function)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--cm-property)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--cm-type)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--cm-punct)" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "var(--cm-ink)" },
]);

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--cm-ink)", fontSize: "12.5px" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--cm-gutter)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "var(--cm-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--cm-ink)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "var(--cm-selection) !important" },
  ".cm-cursor": { borderLeftColor: "var(--color-accent)" },
  ".cm-tooltip": {
    border: "1px solid var(--color-line-strong)",
    backgroundColor: "var(--color-card)",
    color: "var(--color-ink)",
    borderRadius: "4px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
    color: "var(--color-ink)",
  },
});

// Type-to-complete: surface the Playwright snippets inside JS/TS sources.
const snippetCompletions = completeFromList(
  PLAYWRIGHT_SNIPPETS.map((s) =>
    snippetCompletion(s.template, { label: s.label, detail: s.detail, type: "snippet" }),
  ) as Completion[],
);
const snippetExtension = javascriptLanguage.data.of({ autocomplete: snippetCompletions });

const langCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

function languageExt() {
  return props.language === "json"
    ? json()
    : [javascript({ typescript: true }), snippetExtension];
}

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: model.value,
      extensions: [
        basicSetup,
        langCompartment.of(languageExt()),
        readOnlyCompartment.of([
          EditorState.readOnly.of(props.readOnly),
          EditorView.editable.of(!props.readOnly),
        ]),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              emit("save");
              return true;
            },
          },
        ]),
        editorTheme,
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) model.value = u.state.doc.toString();
        }),
      ],
    }),
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// Reflect external model changes (e.g. loading a different recording) without
// clobbering edits the user is typing.
watch(model, (next) => {
  if (view && next !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }
});

watch(
  () => props.language,
  () => view?.dispatch({ effects: langCompartment.reconfigure(languageExt()) }),
);

watch(
  () => props.readOnly,
  (ro) =>
    view?.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(ro),
        EditorView.editable.of(!ro),
      ]),
    }),
);

/** Insert a snippet template at the current cursor — used by the palette button. */
function insertSnippet(template: string) {
  if (!view || props.readOnly) return;
  const { from, to } = view.state.selection.main;
  snippet(template)(view, null, from, to);
  view.focus();
}

defineExpose({ insertSnippet });
</script>

<template>
  <div ref="host" class="cm-host" />
</template>

<style scoped>
.cm-host {
  height: 100%;
  overflow: auto;
}
.cm-host :deep(.cm-editor) {
  height: 100%;
}
</style>
