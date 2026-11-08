import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, indentOnInput, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { createEditorView, markdownEditorTheme, replaceEditorDocument } from "@workspace/editor";

const hide = Decoration.replace({});
const headingTypes = new Set(["ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4", "ATXHeading5", "ATXHeading6"]);

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function taskMarker(text: string): { from: number; checked: boolean } | null {
  const match = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\](?:\s|$)/.exec(text);
  if (!match) return null;
  return { from: match[0].lastIndexOf("["), checked: match[1].toLowerCase() === "x" };
}

function splitTableCells(text: string): string[] {
  const source = text.trim();
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "\\" && source[index + 1] === "|") { cell += "|"; index++; }
    else if (character === "|") { cells.push(cell.trim()); cell = ""; }
    else cell += character;
  }
  cells.push(cell.trim());
  if (source.startsWith("|")) cells.shift();
  if (source.endsWith("|") && !source.endsWith("\\|")) cells.pop();
  return cells;
}

function tableAlignment(text: string): ("left" | "center" | "right")[] | null {
  const cells = splitTableCells(text);
  if (cells.length < 1 || cells.some((cell) => !/^:?-{3,}:?$/.test(cell))) return null;
  return cells.map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left");
}

class DividerWidget extends WidgetType {
  constructor(readonly from: number) { super(); }
  eq(other: DividerWidget) { return other.from === this.from; }
  ignoreEvent() { return true; }
  toDOM(view: EditorView) {
    const divider = document.createElement("div");
    divider.className = "cm-live-divider-widget";
    divider.setAttribute("aria-label", "Markdown divider");
    divider.appendChild(document.createElement("hr"));
    divider.addEventListener("click", (event) => { event.stopPropagation(); view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true }); view.focus(); });
    return divider;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly from: number, readonly to: number, readonly checked: boolean) { super(); }
  eq(other: TaskCheckboxWidget) { return other.from === this.from && other.to === this.to && other.checked === this.checked; }
  ignoreEvent() { return true; }
  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.className = "cm-live-task-checkbox";
    checkbox.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    checkbox.addEventListener("mousedown", (event) => event.stopPropagation());
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      view.dispatch({ changes: { from: this.from, to: this.to, insert: checkbox.checked ? "[x]" : "[ ]" } });
    });
    return checkbox;
  }
}

class TablePreviewWidget extends WidgetType {
  constructor(readonly from: number, readonly headers: string[], readonly rows: string[][], readonly alignments: ("left" | "center" | "right")[], readonly rowStarts: number[]) { super(); }
  eq(other: TablePreviewWidget) {
    return other.from === this.from && JSON.stringify(other.headers) === JSON.stringify(this.headers) && JSON.stringify(other.rows) === JSON.stringify(this.rows) && JSON.stringify(other.alignments) === JSON.stringify(this.alignments) && JSON.stringify(other.rowStarts) === JSON.stringify(this.rowStarts);
  }
  ignoreEvent() { return true; }
  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-live-table-widget";
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    this.headers.forEach((text, index) => {
      const cell = document.createElement("th"); cell.textContent = text; cell.style.textAlign = this.alignments[index] ?? "left"; head.appendChild(cell);
    });
    const body = table.createTBody();
    this.rows.forEach((row, rowIndex) => {
      const tr = body.insertRow();
      this.headers.forEach((_, cellIndex) => {
        const cell = tr.insertCell(); cell.textContent = row[cellIndex] ?? ""; cell.style.textAlign = this.alignments[cellIndex] ?? "left";
      });
      tr.dataset.sourceRow = String(rowIndex + 2);
    });
    head.dataset.sourceRow = "0";
    container.appendChild(table);
    container.addEventListener("click", (event) => {
      event.stopPropagation();
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-source-row]");
      const lineIndex = Number(row?.dataset.sourceRow ?? 0);
      view.dispatch({ selection: { anchor: this.rowStarts[lineIndex] ?? this.from }, scrollIntoView: true });
      view.focus();
    });
    return container;
  }
}

function collectInline(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; decoration: Decoration }[] = [];
  const add = (from: number, to: number, decoration: Decoration) => {
    if (from < to) ranges.push({ from, to, decoration });
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({ from, to, enter(node) {
      const name = node.type.name;
      const raw = selectionTouches(view.state, node.from, node.to);
      if (headingTypes.has(name)) {
        const mark = node.node.getChild("HeaderMark");
        if (!mark) return;
        const contentFrom = mark.to + (view.state.doc.sliceString(mark.to, mark.to + 1) === " " ? 1 : 0);
        const level = name.slice(-1);
        if (contentFrom < node.to) add(contentFrom, node.to, Decoration.mark({ class: `cm-live-heading-text cm-live-h${level}` }));
        if (!raw && contentFrom < node.to) add(mark.from, contentFrom, hide);
        return;
      }
      if (name === "Emphasis" || name === "StrongEmphasis" || name === "Strikethrough") {
        const marks = node.node.getChildren(name === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark");
        if (marks.length !== 2 || marks[0].to >= marks[1].from) return;
        const cls = name === "StrongEmphasis" ? "cm-live-strong" : name === "Strikethrough" ? "cm-live-strike" : "cm-live-em";
        add(marks[0].to, marks[1].from, Decoration.mark({ class: cls }));
        if (!raw) { add(marks[0].from, marks[0].to, hide); add(marks[1].from, marks[1].to, hide); }
        return;
      }
      if (name === "InlineCode") {
        const marks = node.node.getChildren("CodeMark");
        if (marks.length !== 2 || marks[0].to >= marks[1].from) return;
        add(marks[0].to, marks[1].from, Decoration.mark({ class: "cm-live-code" }));
        if (!raw) { add(marks[0].from, marks[0].to, hide); add(marks[1].from, marks[1].to, hide); }
        return;
      }
      if (name === "Link") {
        const sourceLine = view.state.doc.lineAt(node.from);
        const task = taskMarker(sourceLine.text);
        if (task && node.from >= sourceLine.from + task.from && node.from < sourceLine.from + task.from + 3) return;
        const marks = node.node.getChildren("LinkMark");
        const url = node.node.getChild("URL");
        if (marks.length < 2 || marks[0].to >= marks[1].from) return;
        add(marks[0].to, marks[1].from, Decoration.mark({ class: "cm-live-link" }));
        if (url) add(url.from, url.to, Decoration.mark({ class: "cm-live-link-url" }));
        if (!raw) {
          add(marks[0].from, marks[0].to, hide);
          add(marks[1].from, Math.min(node.to, url ? url.to + 1 : marks[1].to), hide);
        }
        return;
      }
      if (name === "Blockquote") {
        add(node.from, node.to, Decoration.mark({ class: "cm-live-quote-text" }));
        for (const mark of node.node.getChildren("QuoteMark")) {
          const line = view.state.doc.lineAt(mark.from);
          if (!selectionTouches(view.state, line.from, line.to)) add(mark.from, mark.to, hide);
        }
        return;
      }
      if (name === "ListItem") {
        if (node.node.getChild("Task")) return;
        const mark = node.node.getChild("ListMark");
        if (mark) {
          const line = view.state.doc.lineAt(mark.from);
          if (taskMarker(line.text)) {
            if (!selectionTouches(view.state, line.from, line.to)) add(mark.from, mark.to, hide);
          } else if (!selectionTouches(view.state, line.from, mark.to)) add(mark.from, mark.to, Decoration.replace({ widget: new ListMarker(view.state.doc.sliceString(mark.from, mark.to)) }));
        }
        return;
      }
      if (name === "HorizontalRule") return;
      if (name === "FencedCode" && !raw) {
        const marks = node.node.getChildren("CodeMark");
        if (marks.length >= 2) {
          const openEnd = view.state.doc.lineAt(marks[0].from).to;
          const closeStart = view.state.doc.lineAt(marks[marks.length - 1].from).from;
          add(marks[0].from, Math.min(openEnd, node.to), hide);
          add(closeStart, marks[marks.length - 1].to, hide);
        }
      }
    }});
  }
  for (const visible of view.visibleRanges) {
    const first = view.state.doc.lineAt(visible.from).number;
    const last = view.state.doc.lineAt(visible.to).number;
    for (let number = first; number <= last; number++) {
      const line = view.state.doc.line(number);
      const task = taskMarker(line.text);
      if (!task || selectionTouches(view.state, line.from, line.to)) continue;
      const from = line.from + task.from;
      add(from, from + 3, Decoration.replace({ widget: new TaskCheckboxWidget(from, from + 3, task.checked) }));
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) builder.add(range.from, range.to, range.decoration);
  return builder.finish();
}

// CodeMirror only accepts block replace decorations from StateFields. Keep
// these separate from the viewport-aware inline ViewPlugin above.
function collectBlock(viewState: EditorState): DecorationSet {
  const ranges: { from: number; to: number; decoration: Decoration }[] = [];
  const add = (from: number, to: number, decoration: Decoration) => {
    if (from < to) ranges.push({ from, to, decoration });
  };
  const document = viewState.doc;
  syntaxTree(viewState).iterate({
    enter(node) {
      if (node.type.name === "HorizontalRule" && !selectionTouches(viewState, node.from, node.to)) {
        add(node.from, node.to, Decoration.replace({ widget: new DividerWidget(node.from), block: true }));
      }
    },
  });

  const checkedTables = new Set<number>();
  for (let number = 1; number <= document.lines; number++) {
    const visibleLine = document.line(number);
    if (!visibleLine.text.includes("|")) continue;
    let headerNumber = number;
    while (headerNumber > 1 && document.line(headerNumber - 1).text.includes("|")) headerNumber--;
    if (checkedTables.has(headerNumber)) continue;
    const header = document.line(headerNumber);
    const separator = headerNumber < document.lines ? document.line(headerNumber + 1) : null;
    const alignments = separator ? tableAlignment(separator.text) : null;
    if (!alignments || !header.text.includes("|")) continue;
    const headers = splitTableCells(header.text);
    if (headers.length !== alignments.length) continue;
    const rows: string[][] = [];
    const rowStarts = [header.from, separator!.from];
    let end = separator!.to;
    for (let rowNumber = headerNumber + 2; rowNumber <= document.lines; rowNumber++) {
      const line = document.line(rowNumber);
      if (!line.text.trim() || !line.text.includes("|")) break;
      rows.push(splitTableCells(line.text));
      rowStarts.push(line.from);
      end = line.to;
    }
    checkedTables.add(headerNumber);
    let insideCode = false;
    syntaxTree(viewState).iterate({ from: header.from, to: end, enter(node) {
      if (node.type.name === "FencedCode" && node.from <= header.from && node.to >= end) insideCode = true;
    }});
    if (!insideCode && !selectionTouches(viewState, header.from, end)) {
      add(header.from, end, Decoration.replace({ widget: new TablePreviewWidget(header.from, headers, rows, alignments, rowStarts), block: true }));
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) builder.add(range.from, range.to, range.decoration);
  return builder.finish();
}

class ListMarker extends WidgetType {
  constructor(readonly marker: string) { super(); }
  eq(other: ListMarker) { return other.marker === this.marker; }
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-live-list-marker";
    marker.textContent = /^\d/.test(this.marker) ? this.marker : "•";
    return marker;
  }
}

const inlineLivePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(readonly view: EditorView) { this.decorations = collectInline(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = collectInline(update.view);
  }
}, { decorations: (plugin) => plugin.decorations });

const blockLivePreview = StateField.define<DecorationSet>({
  create: collectBlock,
  update(decorations, transaction) {
    return transaction.docChanged || transaction.selection
      ? collectBlock(transaction.state)
      : decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const blockLineLivePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(readonly view: EditorView) { this.decorations = this.build(); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = this.build();
  }
  build() {
    const builder = new RangeSetBuilder<Decoration>();
    const lines = new Map<number, string>();
    const addClass = (from: number, className: string) => lines.set(from, `${lines.get(from) ?? ""} ${className}`.trim());
    const view = this.view;
    for (const range of view.visibleRanges) syntaxTree(view.state).iterate({ from: range.from, to: range.to, enter(node) {
      if (node.type.name === "Blockquote") {
        for (const mark of node.node.getChildren("QuoteMark")) addClass(view.state.doc.lineAt(mark.from).from, "cm-live-quote-line");
      }
      if (node.type.name === "FencedCode") {
        const start = view.state.doc.lineAt(node.from).number;
        const end = view.state.doc.lineAt(node.to).number;
        for (let number = start; number <= end; number++) addClass(view.state.doc.line(number).from, "cm-live-code-line");
      }
    }});
    for (const [from, className] of [...lines].sort(([a], [b]) => a - b)) builder.add(from, from, Decoration.line({ class: className }));
    return builder.finish();
  }
}, { decorations: (plugin) => plugin.decorations });

export function MarkdownCodeEditor({ value, onChange, onNavigateReady }: { value: string; onChange: (value: string) => void; onNavigateReady?: (navigate: ((line: number) => void) | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const editor = createEditorView({
      parent: host.current,
      doc: value,
      extensions: [
        markdown(), history(), indentOnInput(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        inlineLivePreview, blockLineLivePreview, blockLivePreview,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": "Markdown editor", autocapitalize: "sentences", spellcheck: "true" }),
        EditorView.updateListener.of((update) => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()); }),
        markdownEditorTheme,
      ],
    });
    view.current = editor;
    return () => { view.current = null; editor.destroy(); };
  }, []);

  useEffect(() => {
    if (!view.current || !onNavigateReady) return;
    const navigate = (line: number) => {
      const editor = view.current;
      if (!editor) return;
      const position = editor.state.doc.line(Math.max(1, Math.min(line, editor.state.doc.lines))).from;
      editor.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      editor.focus();
    };
    onNavigateReady(navigate);
    return () => onNavigateReady(null);
  }, [onNavigateReady]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    replaceEditorDocument(editor, value);
  }, [value]);

  return <div ref={host} className="markdown-code-editor" />;
}
