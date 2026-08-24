import { EditorView } from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

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

// Per-line indent guides, VS Code/Zed-style — a repeating background
// gradient across the whole `.cm-content` (the original approach here)
// draws a line at every 4-column position on *every* line regardless of
// that line's own indentation, including blank and top-level lines: not
// what "indent guide" means in either editor, and not what was asked
// for. `@replit/codemirror-indentation-markers` computes actual per-line
// indent depth (via the same indent-unit CM6 already uses for Tab/auto-
// indent) and only draws markers up to each line's own depth — this is
// what Replit's own editor uses it for, matching VS Code/Zed's behavior
// rather than approximating it with CSS.
//
// The library's own `colors` option only takes effect under CodeMirror's
// *own* `&light`/`&dark` selectors (`.cm-editor.cm-light`/`.cm-dark`,
// set only when the editor's theme was created via `EditorView.theme(
// spec, {dark: true})`) — this app themes purely through its own CSS
// variables and a root `[data-theme]` attribute, so the editor never
// gets either class and those colors silently never applied. Setting
// the same custom properties directly (unscoped) makes them resolve
// regardless of that CM-internal flag.
export const indentGuideColors = EditorView.baseTheme({
  "&": {
    // `--border` (the very first attempt here) rendered correctly but was
    // too close in value to `--bg-base` to actually read as a line at 1px
    // — confirmed via a DOM/computed-style trace, not assumed.
    "--indent-marker-bg-color": "var(--border-strong)",
    "--indent-marker-active-bg-color": "var(--accent)",
  },
});

export const indentGuides = [
  indentGuideColors,
  indentationMarkers({ highlightActiveBlock: true }),
];
