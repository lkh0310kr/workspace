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

// Obsidian (and every other prose-first note app) reads in a
// proportional UI font, not monospace — reusing `--font-mono` for the
// Markdown pane (inherited from `workspaceEditorTheme`, shared with the
// plain-code editor) made regular writing look like a code file. Scoped
// to just `.cm-content`: an element's own font-family always wins over
// whatever it would otherwise inherit from an ancestor (`.cm-scroller`
// here), regardless of which theme extension's stylesheet was injected
// first, so this doesn't need the injection-order workaround
// `columnGuideTheme` used to need below. `.cm-md-code`/
// `.cm-md-codeblock-line` (styles.css) still force monospace for inline
// code and fenced code blocks specifically, since those keep their own
// explicit font-family rule regardless of what their container inherits.
export const markdownProseTheme = EditorView.theme({
  ".cm-content": { fontFamily: "var(--font-ui)" },
});

// Vertical guide line every 4 columns — Obsidian has an equivalent
// built-in "vertical indentation lines" feature. Purely a background
// pattern (unlike the EditorView.atomicRanges cursor-motion fix that
// crashed CodeMirror outright — see markdownLivePreview.ts's own note on
// why that got reverted): it never participates in CodeMirror's
// document/selection model, so it carries none of that risk regardless
// of font. `ch` (the font's own "0" glyph width) won't align pixel-
// perfectly with actual space characters in a proportional font the way
// it would in monospace, but it's a lightweight visual reference for
// indentation depth, not a claim of exact alignment — same spirit as
// the request that asked for it back ("to tell indentation apart").
export const columnGuideTheme = EditorView.theme({
  ".cm-content": {
    backgroundImage:
      "repeating-linear-gradient(to right, transparent 0, transparent calc(4ch - 1px), var(--border) calc(4ch - 1px), var(--border) 4ch)",
  },
});
