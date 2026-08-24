import { EditorView } from "@codemirror/view";

export const workspaceEditorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-font-size, 13px)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-content": {
    // `backgroundColor`, not the `background` shorthand — the shorthand
    // resets every other background sub-property it doesn't mention,
    // including `background-image`, which used to silently erase a
    // gradient-based indent guide on this same selector.
    backgroundColor: "var(--bg-base)",
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

// Obsidian (and every other prose-first note app) reads in a
// proportional UI font, not monospace — reusing `--font-mono` for the
// Markdown pane (inherited from `workspaceEditorTheme`, shared with the
// plain-code editor) made regular writing look like a code file. Scoped
// to just `.cm-content`: an element's own font-family always wins over
// whatever it would otherwise inherit from an ancestor (`.cm-scroller`
// here), regardless of which theme extension's stylesheet was injected
// first. `.cm-md-code`/
// `.cm-md-codeblock-line` (styles.css) still force monospace for inline
// code and fenced code blocks specifically, since those keep their own
// explicit font-family rule regardless of what their container inherits.
export const markdownProseTheme = EditorView.theme({
  ".cm-content": { fontFamily: "var(--font-ui)" },
});

// Indent guides moved to indentGuides.ts — see that file for why (two
// prior approaches attempted here didn't pan out).
