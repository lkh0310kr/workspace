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
  ".cm-gutters": { display: "flex", backgroundColor: "transparent", border: "none", color: "var(--text-muted, var(--muted))" },
  ".cm-foldGutter": { width: "18px" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0", cursor: "pointer", opacity: "0.55" },
  ".cm-foldGutter .cm-gutterElement:hover": { opacity: "1", color: "var(--text)" },
  ".cm-foldGutter .cm-gutterElement .cm-md-fold-marker": { display: "inline-flex", width: "16px", height: "20px", alignItems: "center", justifyContent: "center", fontSize: "14px" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-md-h1, .cm-md-h2, .cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6": {
    color: "var(--text)",
    fontWeight: "600",
    textDecoration: "none",
  },
  ".cm-md-h1": { fontSize: "28px", fontWeight: "700", lineHeight: "1.25" },
  ".cm-md-h2": { fontSize: "22px", fontWeight: "650", lineHeight: "1.3" },
  ".cm-md-h3": { fontSize: "18px", fontWeight: "650", lineHeight: "1.35" },
  ".cm-md-h4": { fontSize: "16px", fontWeight: "600", lineHeight: "1.4" },
  ".cm-md-h5": { fontSize: "14px", fontWeight: "600", lineHeight: "1.5" },
  ".cm-md-h6": { color: "var(--text-muted, var(--muted))", fontSize: "13px", fontWeight: "600", lineHeight: "1.5" },
  ".cm-line:has(.cm-md-h1)": { paddingTop: "32px", paddingBottom: "16px" },
  ".cm-line:has(.cm-md-h2)": { paddingTop: "28px", paddingBottom: "12px" },
  ".cm-line:has(.cm-md-h3)": { paddingTop: "24px", paddingBottom: "10px" },
  ".cm-line:has(.cm-md-h4)": { paddingTop: "20px", paddingBottom: "8px" },
  ".cm-line:has(.cm-md-h5)": { paddingTop: "18px", paddingBottom: "6px" },
  ".cm-line:has(.cm-md-h6)": { paddingTop: "16px", paddingBottom: "6px" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
});
