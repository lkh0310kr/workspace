import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Facet, RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

// Per-view configuration carrying the active tab's root_path, so local
// (non-http) image paths in Markdown can be resolved against it — a
// Facet rather than a constructor argument because the ViewPlugins below
// are built once as static extensions, not per-pane factories; include
// `markdownRootPath.of(rootPath)` in the EditorView's own extensions to
// set it.
export const markdownRootPath = Facet.define<string, string>({
  combine: (values) => values[0] ?? "",
});

// Tauri's convertFileSrc (routed through a registered asset-protocol Scope
// per tab root_path, src/lib.rs's allow_asset_scope) has no Electron
// equivalent in use here — the renderer isn't sandboxed against the
// filesystem the way a Tauri asset scope is, so a plain `file://` URL
// works directly. Path segments are encoded individually (not the whole
// path — encodeURIComponent would also escape the `/` separators).
function resolveImageSrc(rootPath: string, url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (!rootPath) return null;
  const cleaned = url.replace(/^\.\//, "").replace(/^\/+/, "");
  const full = `${rootPath.replace(/\/+$/, "")}/${cleaned}`;
  return `file://${full.split("/").map(encodeURIComponent).join("/")}`;
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

function selectionOverlaps(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
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

  // Toggle wired as a real `click` listener on the widget's own <input> in
  // toDOM, not as a `mousedown` handler on the editor matched by
  // `event.target`/coordinates (that was the original approach here, and
  // it was the actual bug — see below). Matches Zettlr's CM6 task-checkbox
  // widget (render-tasks.ts), the closest architectural reference for this
  // exact problem (also a single-doc CM6 live-preview markdown editor):
  // https://github.com/Zettlr/Zettlr — a real `<input>` node gets its own
  // browser-native hit-testing for free, which our editor-level
  // domEventHandlers + manual target/coordinate check didn't.
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-md-task-checkbox";
    box.addEventListener("click", (event) => {
      const pos = this.markerFrom + 1;
      const current = view.state.doc.sliceString(pos, pos + 1);
      const insert = current.toLowerCase() === "x" ? " " : "x";
      view.dispatch({ changes: { from: pos, to: pos + 1, insert } });
      // Stops the click from also reaching CodeMirror's own default click
      // handling (which places the text cursor at the click position) —
      // `ignoreEvent` below only silences `mousedown`, not `click`.
      event.preventDefault();
      event.stopPropagation();
    });
    return box;
  }

  // Ignoring only `mousedown` (not `click`) matches Zettlr's widget —
  // `click`'s own default action (cursor placement) is instead suppressed
  // per-toggle by this widget's own listener above via preventDefault/
  // stopPropagation, rather than by blanket-ignoring every event type.
  ignoreEvent(event: Event) {
    return event instanceof MouseEvent && event.type === "mousedown";
  }
}

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
          const cls = `cm-md-h${level}`;
          if (contentFrom < node.to) {
            collected.push({ from: contentFrom, to: node.to, deco: Decoration.mark({ class: cls }) });
          }
          const hasContent = contentFrom < node.to;
          if (selectionOverlaps(view.state, node.from, node.to)) {
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
          if (!selectionOverlaps(view.state, node.from, node.to)) {
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
          if (!selectionOverlaps(view.state, node.from, node.to)) {
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
          if (!selectionOverlaps(view.state, node.from, node.to)) {
            collected.push({ from: openBracket.from, to: openBracket.to, deco: HIDE });
            const hideFrom = closeBracket.from;
            const hideTo = url ? url.to + 1 : closeBracket.to;
            collected.push({ from: hideFrom, to: Math.min(hideTo, node.to), deco: HIDE });
          }
          return;
        }

        if (type === "TaskMarker") {
          // Selection-gated like every other element here, not always-
          // rendered — Obsidian reveals the raw "- [ ]" text (dash
          // included) once the cursor reaches the marker itself, not
          // merely anywhere on the same line: placing the cursor in the
          // label text to its right leaves the checkbox control up
          // (confirmed directly — an earlier version of this comment had
          // it as "cursor on that line", which over-triggered raw mode
          // for the entire line's label text too). Gate on
          // [line.from, node.to] — from the start of the line through the
          // end of the "[ ]"/"[x]" marker — not the whole line.
          const line = view.state.doc.lineAt(node.from);
          if (selectionOverlaps(view.state, line.from, node.to)) return;
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
          if (!selectionOverlaps(view.state, node.from, node.to)) {
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
            if (selectionOverlaps(view.state, line.from, line.to)) continue;
            let hideTo = mark.to;
            if (view.state.doc.sliceString(hideTo, hideTo + 1) === " ") hideTo += 1;
            collected.push({ from: mark.from, to: hideTo, deco: HIDE });
          }
          const callout = calloutMarkerRange(view, node);
          if (callout) {
            const line = view.state.doc.lineAt(callout.from);
            if (!selectionOverlaps(view.state, line.from, line.to)) {
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
          if (selectionOverlaps(view.state, node.from, node.to)) return;
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
          if (!selectionOverlaps(view.state, node.from, node.to)) {
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
          if (selectionOverlaps(view.state, node.from, node.to)) return;
          collected.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new ImageWidget(src) }),
          });
          return;
        }

        // Table is handled separately (see buildTableDecorations below) —
        // its widget is a `block: true` replace decoration, and CodeMirror
        // requires those to come from a StateField, not a ViewPlugin
        // (throws "Block decorations may not be specified via plugins" at
        // render time otherwise — reproduced live via a user-reported
        // crash, not hypothetical).
        if (type === "Table") return false;

        if (type === "ListItem") {
          const parentType = node.node.parent?.type.name;
          if (parentType === "OrderedList") {
            // Left as literal visible text (never hidden/replaced,
            // unlike the bullet) — only styled for consistent spacing
            // against the bullet/checkbox markers, matching the
            // requested "unify the marker spacing, not the glyphs"
            // exactly: the digits/period themselves aren't touched.
            const mark = node.node.getChild("ListMark");
            if (mark) {
              collected.push({
                from: mark.from,
                to: mark.to,
                deco: Decoration.mark({ class: "cm-md-list-number" }),
              });
            }
            return;
          }
          if (parentType !== "BulletList") return;
          // Task list items ("- [ ] ...") are still BulletList/ListItem
          // structurally (their content is a "Task" node in place of the
          // usual Paragraph) — rendering the "-" as a bullet on top of
          // the checkbox produced a bullet-then-checkbox double marker
          // that doesn't match Obsidian (no bullet for task items). The
          // dash still needs to actually *hide* here, not just skip the
          // bullet widget — leaving it unhandled left the literal "-"
          // visible as plain text in front of the checkbox.
          const taskNode = node.node.getChild("Task");
          if (taskNode) {
            const taskMark = node.node.getChild("ListMark");
            if (!taskMark) return;
            const taskLine = view.state.doc.lineAt(taskMark.from);
            // Same threshold as the checkbox widget itself (through the
            // end of the "[ ]"/"[x]" marker, not the whole line) — this
            // dash is the other half of that same raw/preview toggle, and
            // gating it on "cursor anywhere on the line" let it stay
            // visible (as a bare "-", not hidden into the checkbox) while
            // the checkbox had already switched back to its widget, i.e.
            // the reported "bullet next to the checkbox" on the current
            // line.
            const checkboxMarker = taskNode.getChild("TaskMarker");
            const rawUntil = checkboxMarker ? checkboxMarker.to : taskLine.to;
            if (!selectionOverlaps(view.state, taskLine.from, rawUntil)) {
              collected.push({ from: taskMark.from, to: taskMark.to, deco: HIDE });
            }
            return;
          }
          const mark = node.node.getChild("ListMark");
          if (!mark) return;
          const line = view.state.doc.lineAt(mark.from);
          // Gated through the marker's own end, not the whole line — same
          // threshold as TaskMarker/CheckboxWidget above (cursor has to be
          // on/near the "-" itself, not just anywhere in that item's text)
          // rather than raw mode covering the entire line's content.
          if (selectionOverlaps(view.state, line.from, mark.to)) {
            // Raw "-" still needs the bullet widget's own width so the
            // line's content doesn't visibly shift when toggling between
            // raw and preview — a bare unstyled "-" is much narrower than
            // the 1.4em bullet glyph box it replaces.
            collected.push({ from: mark.from, to: mark.to, deco: Decoration.mark({ class: "cm-md-bullet-raw" }) });
            return;
          }
          collected.push({
            from: mark.from,
            to: mark.to,
            deco: Decoration.replace({ widget: new BulletWidget() }),
          });
          return;
        }
        // No branch above matched this node type — nothing to decorate.
        // Explicit (not just falling off the end) because the "Table"
        // branch's `return false` makes TS infer a `boolean | void`
        // return type for this callback, and this build's tsconfig (the
        // Electron app's, stricter than ui/'s) turns on noImplicitReturns.
        return;
      },
    });
  }

  collected.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of collected) {
    const isWidget = (deco.spec as { widget?: unknown }).widget !== undefined;
    if (from >= to && !isWidget) continue;
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

// Tables render as a `block: true` replace decoration (see TableWidget),
// which CodeMirror only allows from a StateField — hence this being a
// separate extension from inlineDecorations/blockDecorations above (both
// ViewPlugins). Recomputed over the whole document rather than just
// view.visibleRanges since a StateField's update() only gets the
// transaction, not the view's current viewport.
function buildTableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  syntaxTree(state).iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.type.name !== "Table") return;
      if (selectionOverlaps(state, node.from, node.to)) return;
      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(node.to);
      // See TableWidget's comment: block decorations must span exact line
      // boundaries, so this is checked rather than assumed.
      if (startLine.from !== node.from || endLine.to !== node.to) return;
      const header = node.node.getChild("TableHeader");
      if (!header) return;
      const cellText = (n: SyntaxNodeRef) => state.doc.sliceString(n.from, n.to).trim();
      const headerCells = header.getChildren("TableCell").map(cellText);
      const bodyRows = node.node
        .getChildren("TableRow")
        .map((row) => row.getChildren("TableCell").map(cellText));
      builder.add(
        node.from,
        node.to,
        Decoration.replace({ widget: new TableWidget(headerCells, bodyRows), block: true }),
      );
    },
  });
  return builder.finish();
}

const tableDecorations = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update: (deco, tr) => (tr.docChanged || tr.selection ? buildTableDecorations(tr.state) : deco.map(tr.changes)),
  provide: (field) => EditorView.decorations.from(field),
});

// `EditorView.atomicRanges` (making hidden marker ranges an indivisible
// unit for cursor motion — the "correct", CM6-documented fix for a minor
// cursor-lands-one-char-off bug when arrowing into a heading/link line)
// was tried here and reverted: reading `view.plugin(inlineDecorations)
// ?.atomic` (a field cached from the previous update cycle) crashed
// CodeMirror outright ("No tile at position N") the first time TreeView
// loaded a different, differently-sized file into an already-open
// pane — reported and reproduced directly by a user, not hypothetical.
// The suspected cause: atomicRanges is consulted during CodeMirror's own
// selection-mapping for a transaction, which can run before this
// document's ViewPlugins have updated for that same transaction, so the
// cached field still described the *old* (now-replaced) document —
// stale ranges pointing past the new, shorter document's length broke
// CodeMirror's internal line lookup. A variant recomputing straight from
// `view.state` instead of the cached field was written to fix that, but
// never verified live (no way to test interactively from here), and a
// hard crash blocking "open a file" is a far worse outcome than the
// cosmetic bug atomicRanges was meant to fix — so rather than ship an
// unverified fix for something this severe, atomicRanges is left out
// entirely until it can be revisited with a way to test it for real.
export const markdownLivePreview: Extension[] = [inlineDecorations, blockDecorations, tableDecorations];
