import { EditorView } from "@codemirror/view";

export const workspaceEditorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-content": {
    background: "var(--bg-base)",
    color: "var(--text)",
    caretColor: "var(--text)",
  },
  ".cm-gutters": {
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    border: "none",
  },
  ".cm-activeLine": { background: "var(--bg-hover)" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
});

// Vertical guide line every 4 columns. A second `EditorView.theme()`
// extension rather than a plain CSS rule in styles.css — CodeMirror
// injects its theme stylesheets at runtime (when the EditorView mounts),
// after styles.css has already loaded, and `workspaceEditorTheme`'s own
// `.cm-content { background: var(--bg-base) }` rule above would win a
// same-specificity cascade race against a static stylesheet rule (the
// `background` shorthand implicitly resets `background-image` to `none`
// for every element it applies to). Composing it as another extension
// instead means CodeMirror concatenates both into the same stylesheet in
// extension order, so this — added after `workspaceEditorTheme` wherever
// it's used — reliably wins without needing `!important`. `ch` is the
// width of the font's own "0" glyph, so this stays aligned to the
// monospace character grid regardless of font-size/zoom; `.cm-content`
// has no horizontal padding by default, so column 0 lines up with x=0.
export const columnGuideTheme = EditorView.theme({
  ".cm-content": {
    backgroundImage:
      "repeating-linear-gradient(to right, transparent 0, transparent calc(4ch - 1px), var(--border) calc(4ch - 1px), var(--border) 4ch)",
  },
});
