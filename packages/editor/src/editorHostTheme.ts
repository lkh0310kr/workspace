import { EditorView } from "@codemirror/view";

export const workspaceEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--editor-font-size, 13px)",
    backgroundColor: "var(--editor-bg, transparent)",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-content": {
    // Keep the editable surface transparent. CodeMirror paints selection
    // rectangles in a sibling layer behind `.cm-content`; an opaque content
    // background hides those rectangles even when the selection theme matches.
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
  // CodeMirror deliberately puts its selection layer at z-index -1, behind
  // `.cm-content`. Keep the content surface transparent so the range markers
  // remain visible while text is painted above them.
  ".cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg, var(--selected)) !important",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg-focused, var(--selected)) !important",
  },
});

// Indent guides moved to indentGuides.ts — see that file for why (two
// prior approaches attempted here didn't pan out).
