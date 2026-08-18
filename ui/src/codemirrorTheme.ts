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
