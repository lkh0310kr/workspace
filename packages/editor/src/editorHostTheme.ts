import { EditorView } from "@codemirror/view";

export const workspaceEditorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-font-size, 13px)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-content": {
    // `backgroundColor`, not the `background` shorthand — the shorthand
    // resets every other background sub-property it doesn't mention,
    // including `background-image`, which used to silently erase a
    // gradient-based indent guide on this same selector.
    backgroundColor: "var(--editor-bg)",
    color: "var(--text)",
    caretColor: "var(--text)",
  },
  ".cm-gutters": {
    background: "var(--editor-bg)",
    color: "var(--text-muted)",
    border: "none",
  },
  ".cm-activeLine": { background: "var(--bg-hover)" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
  // CodeMirror's selection layer sits behind the opaque .cm-content surface by
  // default. Raise it explicitly and theme it here so code, Markdown, and PKMS
  // Shadow DOM views all paint ranges with the same visible accent color.
  ".cm-selectionLayer": { zIndex: "2" },
  ".cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg, var(--selected)) !important",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg-focused, var(--selected)) !important",
  },
});

// Indent guides moved to indentGuides.ts — see that file for why (two
// prior approaches attempted here didn't pan out).
