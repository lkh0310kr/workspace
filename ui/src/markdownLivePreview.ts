import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Facet, RangeSetBuilder, type Extension } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import { convertFileSrc } from "@tauri-apps/api/core";

// Per-view configuration carrying the active tab's root_path, so local
// (non-http) image paths in Markdown can be resolved against it — a
// Facet rather than a constructor argument because the ViewPlugins below
// are built once as static extensions, not per-pane factories; include
// `markdownRootPath.of(rootPath)` in the EditorView's own extensions to
// set it.
export const markdownRootPath = Facet.define<string, string>({
  combine: (values) => values[0] ?? "",
});

function resolveImageSrc(rootPath: string, url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (!rootPath) return null;
  const cleaned = url.replace(/^\.\//, "").replace(/^\/+/, "");
  // Tauri's asset-protocol Scope (registered per tab root_path in
  // src/lib.rs's allow_asset_scope) is the real enforcement boundary for
  // what this can actually read — a path that escapes the root is
  // rejected there regardless of what URL convertFileSrc produces here.
  return convertFileSrc(`${rootPath.replace(/\/+$/, "")}/${cleaned}`);
}

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

export const HEADING_TYPES = new Set([
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

const CALLOUT_MARKER_RE = /^\[!([\w-]+)\]/;

const CALLOUT_LABELS: Record<string, string> = {
  note: "Note",
  info: "Info",
  tip: "Tip",
  success: "Success",
  question: "Question",
  warning: "Warning",
  danger: "Danger",
  failure: "Failure",
  bug: "Bug",
  example: "Example",
  quote: "Quote",
};

// Obsidian's callout syntax (`> [!note] Title`) is just a regular
// blockquote whose first line happens to start with `[!type]` — there's
// no dedicated syntax-tree node for it, so both decoration passes below
// detect it the same way from a Blockquote node's first QuoteMark.
function calloutMarkerRange(
  view: EditorView,
  node: SyntaxNodeRef,
): { type: string; from: number; to: number } | null {
  const firstMark = node.node.getChild("QuoteMark");
  if (!firstMark) return null;
  const line = view.state.doc.lineAt(firstMark.from);
  let contentStart = firstMark.to;
  if (view.state.doc.sliceString(contentStart, contentStart + 1) === " ") contentStart += 1;
  const match = CALLOUT_MARKER_RE.exec(view.state.doc.sliceString(contentStart, line.to));
  if (!match) return null;
  return { type: match[1].toLowerCase(), from: contentStart, to: contentStart + match[0].length };
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

class CalloutLabelWidget extends WidgetType {
  constructor(readonly calloutType: string) {
    super();
  }

  eq(other: CalloutLabelWidget) {
    return other.calloutType === this.calloutType;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = `cm-md-callout-label cm-md-callout-${this.calloutType}`;
    span.textContent = CALLOUT_LABELS[this.calloutType] ?? this.calloutType;
    return span;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src;
  }

  toDOM() {
    const img = document.createElement("img");
    img.src = this.src;
    img.loading = "lazy";
    img.className = "cm-md-image";
    return img;
  }
}

// Rendered via a block-replace decoration (`block: true`) — unlike
// HorizontalRule, a table genuinely spans multiple lines, and CodeMirror
// only allows a replace decoration to cross a line break when it's
// marked block. That in turn requires the replaced range to span exactly
// from one line's start to another line's end; the call site verifies
// that against the document's actual line boundaries before using this
// widget, rather than assuming the parser guarantees it.
class TableWidget extends WidgetType {
  constructor(
    readonly header: string[],
    readonly rows: string[][],
  ) {
    super();
  }

  eq(other: TableWidget) {
    return (
      JSON.stringify(other.header) === JSON.stringify(this.header) &&
      JSON.stringify(other.rows) === JSON.stringify(this.rows)
    );
  }

  toDOM() {
    const table = document.createElement("table");
    table.className = "cm-md-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const cell of this.header) {
      const th = document.createElement("th");
      th.textContent = cell;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const row of this.rows) {
      const tr = document.createElement("tr");
      for (const cell of row) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }
}

function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
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
          const cls = `cm-md-h${level}`;
          if (contentFrom < node.to) {
            collected.push({ from: contentFrom, to: node.to, deco: Decoration.mark({ class: cls }) });
          }
          const hasContent = contentFrom < node.to;
          if (selectionOverlaps(view, node.from, node.to)) {
            // Marker stays visible while editing this line (cursor is on
            // it) — size it the same as the content, so "#"/"##"/etc.
            // plus whatever's typed after it reads as one coherent
            // heading instead of a small marker next to big text. Also
            // covers a bare "# " with nothing typed yet — that used to
            // get no styling at all, which is what made it look like it
            // "wasn't a heading yet" until you typed the first character.
            collected.push({ from: mark.from, to: contentFrom, deco: Decoration.mark({ class: cls }) });
          } else if (hasContent) {
            collected.push({ from: mark.from, to: contentFrom, deco: HIDE });
          }
          // else: an empty heading ("#"/"# " with nothing after it) that
          // isn't being edited — leave the marker as plain, small,
          // visible text rather than collapsing the only thing on the
          // line to nothing, which just looked like a blank empty line.
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
          const callout = calloutMarkerRange(view, node);
          if (callout) {
            const line = view.state.doc.lineAt(callout.from);
            if (!selectionOverlaps(view, line.from, line.to)) {
              collected.push({
                from: callout.from,
                to: callout.to,
                deco: Decoration.replace({ widget: new CalloutLabelWidget(callout.type) }),
              });
            }
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

        if (type === "WikiLink") {
          // `[[Target]]` or `[[Target|Alias]]` (custom node from
          // markdownWikilink.ts — no built-in lezer support for this).
          const full = view.state.doc.sliceString(node.from, node.to);
          const pipeIdx = full.indexOf("|");
          const innerFrom = node.from + 2;
          const innerTo = node.to - 2;
          const displayFrom = pipeIdx >= 0 ? node.from + pipeIdx + 1 : innerFrom;
          if (displayFrom >= innerTo) return;
          collected.push({
            from: displayFrom,
            to: innerTo,
            deco: Decoration.mark({ class: "cm-md-link cm-md-wikilink" }),
          });
          if (!selectionOverlaps(view, node.from, node.to)) {
            collected.push({ from: node.from, to: displayFrom, deco: HIDE });
            collected.push({ from: innerTo, to: node.to, deco: HIDE });
          }
          return;
        }

        if (type === "Image") {
          // Structure mirrors Link: [ LinkMark "![" ] alt [ LinkMark "]" ]
          // [ LinkMark "(" ] URL [ LinkMark ")" ]. Remote http(s) URLs
          // load directly; a local relative path resolves against the
          // active tab's root_path (via markdownRootPath) and goes
          // through Tauri's asset protocol.
          const url = node.node.getChild("URL");
          if (!url) return;
          const rawUrl = view.state.doc.sliceString(url.from, url.to);
          const src = resolveImageSrc(view.state.facet(markdownRootPath), rawUrl);
          if (!src) return;
          if (selectionOverlaps(view, node.from, node.to)) return;
          collected.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new ImageWidget(src) }),
          });
          return;
        }

        if (type === "Table") {
          if (selectionOverlaps(view, node.from, node.to)) return;
          const startLine = view.state.doc.lineAt(node.from);
          const endLine = view.state.doc.lineAt(node.to);
          // See TableWidget's comment: block decorations must span exact
          // line boundaries, so this is checked rather than assumed.
          if (startLine.from !== node.from || endLine.to !== node.to) return;
          const header = node.node.getChild("TableHeader");
          if (!header) return;
          const cellText = (n: SyntaxNodeRef) => view.state.doc.sliceString(n.from, n.to).trim();
          const headerCells = header.getChildren("TableCell").map(cellText);
          const bodyRows = node.node
            .getChildren("TableRow")
            .map((row) => row.getChildren("TableCell").map(cellText));
          collected.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new TableWidget(headerCells, bodyRows), block: true }),
          });
          return false;
        }

        if (type === "ListItem") {
          if (node.node.parent?.type.name !== "BulletList") return;
          const mark = node.node.getChild("ListMark");
          if (!mark) return;
          const line = view.state.doc.lineAt(mark.from);
          if (selectionOverlaps(view, line.from, line.to)) return;
          collected.push({
            from: mark.from,
            to: mark.to,
            deco: Decoration.replace({ widget: new BulletWidget() }),
          });
          return;
        }
      },
    });
  }

  collected.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  // A second, filtered set of just the ranges that actually collapse text
  // (HIDE, plus every widget replace) — fed to `EditorView.atomicRanges`
  // below so arrow-key motion treats each as a single indivisible unit
  // instead of allowed to land on a document offset inside it. Without
  // this, moving the cursor onto a heading/link/etc. line via Up/Down or
  // wrapped Left/Right can land one character off from where it visually
  // appears: CodeMirror computes the motion target against the *current*
  // (pre-transaction) rendered layout, where the marker text is hidden,
  // but the decorations then recompute for the new selection and unhide
  // it — the two don't agree on column-to-offset mapping in between.
  // `Decoration.mark` ranges (bold/italic/etc. styling, which doesn't
  // collapse anything) are deliberately excluded so free cursor movement
  // through the middle of styled text still works.
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of collected) {
    const isWidget = (deco.spec as { widget?: unknown }).widget !== undefined;
    if (from >= to && !isWidget) continue;
    builder.add(from, to, deco);
    if (deco === HIDE || isWidget) {
      atomicBuilder.add(from, to, deco);
    }
  }
  return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
}

const inlineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      const built = buildDecorations(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        const built = buildDecorations(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

const atomicHiddenRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(inlineDecorations)?.atomic ?? Decoration.none,
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
        let cls = type === "Blockquote" ? "cm-md-quote-line" : "cm-md-codeblock-line";
        if (type === "Blockquote") {
          const callout = calloutMarkerRange(view, node);
          if (callout) cls += ` cm-md-callout-line cm-md-callout-${callout.type}-line`;
        }
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

export const markdownLivePreview: Extension[] = [
  inlineDecorations,
  blockDecorations,
  taskCheckboxHandlers,
  atomicHiddenRanges,
];
