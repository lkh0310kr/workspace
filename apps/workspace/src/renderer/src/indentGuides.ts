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
// Apply a line decoration and paint guides as the line's background. A
// character border follows glyph boxes, so each guide looked like a stack
// of short dashes instead of a continuous vertical line.
const INDENT_UNIT = 4;

const indentLineDecorations = new Map<number, Decoration>();

function indentLineDecoration(level: number): Decoration {
  let decoration = indentLineDecorations.get(level);
  if (!decoration) {
    decoration = Decoration.line({
      attributes: {
        class: "cm-indent-guide-line",
        style: `--indent-guide-width: ${level * INDENT_UNIT + 0.1}ch`,
      },
    });
    indentLineDecorations.set(level, decoration);
  }
  return decoration;
}

function indentLevel(text: string): number {
  let columns = 0;
  for (const char of text) {
    if (char === " ") columns++;
    else if (char === "\t") columns += INDENT_UNIT - (columns % INDENT_UNIT);
    else break;
  }
  return Math.floor(columns / INDENT_UNIT);
}

function buildIndentGuideDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  let lastLineFrom = -1;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (line.from === lastLineFrom) {
        pos = line.to + 1;
        continue;
      }
      lastLineFrom = line.from;
      const level = indentLevel(line.text);
      if (level > 0) {
        builder.add(line.from, line.from, indentLineDecoration(level));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

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
  ".cm-indent-guide-line": {
    backgroundImage:
      "repeating-linear-gradient(to right, transparent 0 calc(4ch - 0.5px), var(--border) calc(4ch - 0.5px) calc(4ch + 0.5px), transparent calc(4ch + 0.5px) 4ch)",
    backgroundSize: "var(--indent-guide-width) 100%",
    backgroundRepeat: "no-repeat",
  },
});

export const indentGuides = [indentGuidePlugin, indentGuideTheme];
