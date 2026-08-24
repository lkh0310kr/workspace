import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// Per-line indent guides, VS Code/Zed-style. Two earlier approaches here
// both failed:
//
// 1. A repeating background gradient across the whole `.cm-content` drew a
//    line at every 4-column position on *every* line regardless of that
//    line's own indentation — not what "indent guide" means in either
//    editor (direct user feedback).
// 2. `@replit/codemirror-indentation-markers` (the package Replit's own
//    editor actually uses for this) computes correct per-line depth, but
//    its marker is a `position: absolute; z-index: -1` `::before`
//    pseudo-element with its color driven through a CSS custom property
//    inside a `background` shorthand. Confirmed via `getComputedStyle`
//    that the browser resolves that to a fully valid, correctly-colored
//    gradient — and it still never painted on screen in this app's
//    WKWebView. Root cause not pinned down (time-boxed rather than kept
//    guessing at WebKit stacking-context internals); abandoned rather than
//    ship something unverifiable.
//
// This instead marks individual leading-whitespace characters with a
// plain `border-left`, which every rendering engine has always supported
// with zero pseudo-element/z-index/custom-property involvement — the
// least exotic thing that could possibly work. It costs each guide crossed
// 1 layout pixel (the border's own width) nudging that line's text right;
// imperceptible at realistic nesting depths and a fully worthwhile trade
// for guides that are guaranteed to actually render.
const INDENT_UNIT = 4;

function buildIndentGuideDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const text = line.text;
      let leading = 0;
      while (leading < text.length && text.charCodeAt(leading) === 32) leading++;
      const level = Math.floor(leading / INDENT_UNIT);
      // One guide per ancestor level (not the line's own depth), drawn at
      // the first character of that level's indent unit — matches this
      // codebase's own TreeView.tsx guide convention (see its comment on
      // why ancestor-level, not own-depth).
      for (let l = 1; l <= level; l++) {
        const charPos = line.from + (l - 1) * INDENT_UNIT;
        if (charPos < line.to) {
          builder.add(charPos, charPos + 1, indentGuideMark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const indentGuideMark = Decoration.mark({ class: "cm-indent-guide" });

export const indentGuidePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildIndentGuideDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildIndentGuideDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const indentGuideTheme = EditorView.baseTheme({
  ".cm-indent-guide": {
    borderLeft: "1px solid var(--border-strong)",
  },
});

export const indentGuides = [indentGuidePlugin, indentGuideTheme];
