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
  // Keep selection paint inside CodeMirror's root so it works in PKMS's Shadow DOM
  // as well as the normal Workspace document. Global editor CSS cannot cross that root.
  "& .cm-selectionBackground": { backgroundColor: "var(--editor-selection-bg, var(--selected)) !important" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--editor-selection-bg-focused, var(--selected)) !important" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
});
