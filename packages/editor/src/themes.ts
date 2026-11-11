import { EditorView } from "@codemirror/view";

/** Markdown reading typography shared by PKMS and Workspace. */
export const markdownProseTheme = EditorView.theme({
  ".cm-content": { fontFamily: "var(--font-ui, var(--editor-font, sans-serif))" },
});

/** Workspace-style note surface used by Markdown editor hosts. */
export const markdownEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "var(--editor-bg, var(--editor))",
    fontSize: "var(--editor-font-size, 14px)",
  },
  ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono, var(--editor-font, monospace))" },
  ".cm-content": {
    padding: "8px clamp(18px, 5vw, 64px) 48px",
    lineHeight: "1.8",
    caretColor: "var(--text)",
    maxWidth: "820px",
    margin: "0 auto",
  },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground": { backgroundColor: "var(--editor-selection-bg-focused, var(--selected)) !important" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
});
