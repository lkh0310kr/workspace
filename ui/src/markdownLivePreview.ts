import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

// Obsidian-style "live preview": markdown syntax markers (##, **, `, [](),
// ...) render as real formatting instead of literal characters, but only
// when the cursor/selection isn't touching that element — move the cursor
// into a bold word and the ** reappear so it's still editable as plain
// text. The document itself never leaves plain markdown; this only ever
// changes what's *displayed*, via CodeMirror's decoration layer, so
// round-tripping through readFile/writeFile can't be affected by it.
//
// Every element below is decorated as two *adjacent, non-overlapping*
// ranges — a `replace` (hide) on the marker tokens, a `mark` (style) on
// the content between them — rather than one range nested inside the
// other. Nesting a `replace` inside a `mark` at the same start position
// is technically supported by CodeMirror's decoration model, but in
// practice it silently failed to render here; splitting them into
// disjoint ranges avoids relying on that nesting behavior entirely.

const HIDE = Decoration.replace({});

const HEADING_TYPES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

function selectionOverlaps(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const collected: { from: number; to: number; deco: Decoration }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        const type = node.type.name;

        if (HEADING_TYPES.has(type)) {
          const level = Number(type[type.length - 1]);
          const mark = node.node.getChild("HeaderMark");
          if (!mark) return;
          let contentFrom = mark.to;
          if (view.state.doc.sliceString(contentFrom, contentFrom + 1) === " ") contentFrom += 1;
          if (contentFrom >= node.to) return;
          collected.push({
            from: contentFrom,
            to: node.to,
            deco: Decoration.mark({ class: `cm-md-h${level}` }),
          });
          if (!selectionOverlaps(view, node.from, node.to)) {
            collected.push({ from: mark.from, to: contentFrom, deco: HIDE });
          }
          return;
        }

        if (type === "StrongEmphasis" || type === "Emphasis") {
          const marks = node.node.getChildren("EmphasisMark");
          if (marks.length !== 2) return;
          const [open, close] = marks;
          if (open.to >= close.from) return;
          collected.push({
            from: open.to,
            to: close.from,
            deco: Decoration.mark({
              class: type === "StrongEmphasis" ? "cm-md-strong" : "cm-md-em",
            }),
          });
          if (!selectionOverlaps(view, node.from, node.to)) {
            collected.push({ from: open.from, to: open.to, deco: HIDE });
            collected.push({ from: close.from, to: close.to, deco: HIDE });
          }
          return;
        }

        if (type === "InlineCode") {
          const marks = node.node.getChildren("CodeMark");
          if (marks.length !== 2) return;
          const [open, close] = marks;
          if (open.to >= close.from) return;
          collected.push({
            from: open.to,
            to: close.from,
            deco: Decoration.mark({ class: "cm-md-code" }),
          });
          if (!selectionOverlaps(view, node.from, node.to)) {
            collected.push({ from: open.from, to: open.to, deco: HIDE });
            collected.push({ from: close.from, to: close.to, deco: HIDE });
          }
          return;
        }

        if (type === "Link") {
          // Structure: [ LinkMark "[" ] LinkText [ LinkMark "]" ]
          //            [ LinkMark "(" ] URL      [ LinkMark ")" ]
          const marks = node.node.getChildren("LinkMark");
          const url = node.node.getChild("URL");
          if (marks.length < 2) return;
          const openBracket = marks[0];
          const closeBracket = marks[1];
          if (openBracket.to >= closeBracket.from) return;
          collected.push({
            from: openBracket.to,
            to: closeBracket.from,
            deco: Decoration.mark({ class: "cm-md-link" }),
          });
          if (!selectionOverlaps(view, node.from, node.to)) {
            collected.push({ from: openBracket.from, to: openBracket.to, deco: HIDE });
            const hideFrom = closeBracket.from;
            const hideTo = url ? url.to + 1 : closeBracket.to;
            collected.push({ from: hideFrom, to: Math.min(hideTo, node.to), deco: HIDE });
          }
          return;
        }
      },
    });
  }

  collected.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of collected) {
    if (from >= to && !(deco.spec as { widget?: unknown }).widget) continue;
    builder.add(from, to, deco);
  }
  return builder.finish();
}

export const markdownLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);
