import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

// Obsidian-style "live preview": markdown syntax markers (##, **, `, [](),
// ...) render as real formatting instead of literal characters, but only
// when the cursor/selection isn't touching that element — move the cursor
// into a bold word and the ** reappear so it's still editable as plain
// text. The document itself never leaves plain markdown; this only ever
// changes what's *displayed*, via CodeMirror's decoration layer, so
// round-tripping through readFile/writeFile can't be affected by it.
//
// Every inline element below is decorated as two *adjacent, non-overlapping*
// ranges — a `replace` (hide) on the marker tokens, a `mark` (style) on
// the content between them — rather than one range nested inside the
// other. Nesting a `replace` inside a `mark` at the same start position
// is technically supported by CodeMirror's decoration model, but in
// practice it silently failed to render here; splitting them into
// disjoint ranges avoids relying on that nesting behavior entirely. Block
// -level styling (blockquote borders, code block backgrounds) is handled
// by a *separate* line-decoration plugin below rather than mixed into
// this same RangeSetBuilder, to avoid relying on the more fragile
// same-position ordering rules CodeMirror imposes when point (line) and
// range (mark/replace) decorations are interleaved.

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

class CheckboxWidget extends WidgetType {
  constructor(
    readonly markerFrom: number,
    readonly checked: boolean,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.markerFrom === this.markerFrom;
  }

  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-md-task-checkbox";
    // The toggle position (the space/x inside "[ ]") is baked into the
    // DOM node itself rather than recovered via view.posAtDOM — widget
    // position mapping through CodeMirror's DOM layer is easy to get
    // subtly wrong, whereas this is exact by construction.
    box.dataset.markerFrom = String(this.markerFrom);
    return box;
  }

  ignoreEvent() {
    return false;
  }
}

// Clicking a rendered checkbox flips the single character inside its
// "[ ]"/"[x]" marker in the underlying document. That's a plain text
// edit, so it flows through the same doc-changed path as typing —
// decorations rebuild from the new text and the widget is recreated
// with the correct `checked` state regardless of what the native
// <input> DOM node's own transient `.checked` property did.
const taskCheckboxHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement | null;
    if (!target?.classList.contains("cm-md-task-checkbox")) return false;
    const markerFrom = Number(target.dataset.markerFrom);
    if (!Number.isFinite(markerFrom)) return false;
    const pos = markerFrom + 1;
    const current = view.state.doc.sliceString(pos, pos + 1);
    const insert = current.toLowerCase() === "x" ? " " : "x";
    view.dispatch({ changes: { from: pos, to: pos + 1, insert } });
    event.preventDefault();
    return true;
  },
});

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

        if (type === "StrongEmphasis" || type === "Emphasis" || type === "Strikethrough") {
          const markName = type === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark";
          const marks = node.node.getChildren(markName);
          if (marks.length !== 2) return;
          const [open, close] = marks;
          if (open.to >= close.from) return;
          const cls =
            type === "StrongEmphasis" ? "cm-md-strong" : type === "Emphasis" ? "cm-md-em" : "cm-md-strike";
          collected.push({ from: open.to, to: close.from, deco: Decoration.mark({ class: cls }) });
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

        if (type === "TaskMarker") {
          // Always rendered as a checkbox, cursor position notwithstanding
          // — it's a control, not text you'd want to edit character by
          // character, matching how Obsidian treats it.
          const checked = view.state.doc.sliceString(node.from, node.to).toLowerCase() === "[x]";
          collected.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new CheckboxWidget(node.from, checked) }),
          });
          return;
        }

        if (type === "HorizontalRule") {
          // Rendered via a full-width border on a `mark` decoration
          // rather than a block-replace widget: `HorizontalRule`'s span
          // can start a few columns into the line (CommonMark allows up
          // to 3 leading spaces before the `---`), and CodeMirror block
          // decorations are required to span exactly line-start to
          // line-end — a mark sidesteps that constraint entirely.
          if (!selectionOverlaps(view, node.from, node.to)) {
            collected.push({
              from: node.from,
              to: node.to,
              deco: Decoration.mark({ class: "cm-md-hr" }),
            });
          }
          return;
        }

        if (type === "Blockquote") {
          for (const mark of node.node.getChildren("QuoteMark")) {
            const line = view.state.doc.lineAt(mark.from);
            if (selectionOverlaps(view, line.from, line.to)) continue;
            let hideTo = mark.to;
            if (view.state.doc.sliceString(hideTo, hideTo + 1) === " ") hideTo += 1;
            collected.push({ from: mark.from, to: hideTo, deco: HIDE });
          }
          return;
        }

        if (type === "FencedCode") {
          const marks = node.node.getChildren("CodeMark");
          if (marks.length < 2) return;
          const openMark = marks[0];
          const closeMark = marks[marks.length - 1];
          if (selectionOverlaps(view, node.from, node.to)) return;
          // CodeInfo (the fenced language tag) sits on the same line as
          // openMark, so hiding to end-of-line takes it too.
          const openLineEnd = view.state.doc.lineAt(openMark.from).to;
          collected.push({ from: openMark.from, to: Math.min(openLineEnd, node.to), deco: HIDE });
          if (closeMark.from > openMark.to) {
            const closeLineStart = view.state.doc.lineAt(closeMark.from).from;
            collected.push({ from: closeLineStart, to: closeMark.to, deco: HIDE });
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

const inlineDecorations = ViewPlugin.fromClass(
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

// Block-level styling (blockquote left border/indent, fenced-code-block
// background) applies per line rather than as an inline mark/replace
// range, so it lives in its own decoration set built the same way
// CodeMirror's own active-line highlighting does — kept separate from
// `inlineDecorations` above rather than merged into one RangeSetBuilder.
function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const lineClasses = new Map<number, string>();

  const addClass = (lineFrom: number, cls: string) => {
    lineClasses.set(lineFrom, lineClasses.has(lineFrom) ? `${lineClasses.get(lineFrom)} ${cls}` : cls);
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        const type = node.type.name;
        if (type !== "Blockquote" && type !== "FencedCode") return;
        const cls = type === "Blockquote" ? "cm-md-quote-line" : "cm-md-codeblock-line";
        const startLine = view.state.doc.lineAt(node.from).number;
        const endLine = view.state.doc.lineAt(node.to).number;
        for (let ln = startLine; ln <= endLine; ln++) {
          addClass(view.state.doc.line(ln).from, cls);
        }
      },
    });
  }

  const sortedLineFroms = [...lineClasses.keys()].sort((a, b) => a - b);
  for (const lineFrom of sortedLineFroms) {
    builder.add(lineFrom, lineFrom, Decoration.line({ class: lineClasses.get(lineFrom)! }));
  }
  return builder.finish();
}

const blockDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

export const markdownLivePreview: Extension[] = [inlineDecorations, blockDecorations, taskCheckboxHandlers];
