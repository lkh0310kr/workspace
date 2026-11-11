import { EditorView } from "@codemirror/view";

export const workspaceEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--editor-font-size, 13px)",
    backgroundColor: "var(--editor-bg, transparent)",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-content": {
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
});

// Indent guides moved to indentGuides.ts — see that file for why (two
// prior approaches attempted here didn't pan out).
