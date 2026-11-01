import { indentUnit } from "@codemirror/language";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const INDENT_SIZE_CANDIDATES = [2, 3, 4, 6, 8];
const INDENT_SCAN_LIMIT = 300;

function leadingIndentColumns(text: string, tabSize: number): number {
  let columns = 0;
  for (const char of text) {
    if (char === " ") columns++;
    else if (char === "\t") columns += tabSize - (columns % tabSize);
    else break;
  }
  return columns;
}

/** Match VS Code's indentation detection closely for common project styles. */
export function detectIndentSize(lines: Iterable<string>, fallback: number, tabSize = 4): number {
  const widths: number[] = [];
  for (const text of lines) {
    if (text.startsWith("\t")) return tabSize;
    const columns = leadingIndentColumns(text, tabSize);
    if (columns > 0) widths.push(columns);
  }
  if (widths.length === 0) return fallback;

  let bestSize = fallback;
  let bestScore = -1;
  for (const candidate of INDENT_SIZE_CANDIDATES) {
    const score = widths.filter((width) => width % candidate === 0).length;
    if (score > bestScore || (score === bestScore && candidate > bestSize)) {
      bestScore = score;
      bestSize = candidate;
    }
  }
  return bestSize;
}

/** VS Code places guides at the start of each indent level, never at the
 * current line's text start (the final indentation boundary). */
export function indentGuideColumns(indentColumns: number, indentSize: number): number[] {
  const count = Math.floor(indentColumns / indentSize);
  return Array.from({ length: count }, (_unused, level) => level * indentSize);
}

function documentIndentSize(view: EditorView): number {
  const lines: string[] = [];
  const doc = view.state.doc;
  const scanTo = Math.min(doc.lines, INDENT_SCAN_LIMIT);
  for (let lineNumber = 1; lineNumber <= scanTo; lineNumber++) {
    lines.push(doc.line(lineNumber).text);
  }
  const configuredIndentSize = view.state.facet(indentUnit).replaceAll("\t", "    ").length;
  return detectIndentSize(lines, configuredIndentSize || 4, view.state.tabSize);
}

function documentOffsetAtVisualColumn(text: string, column: number, tabSize: number): number {
  let visualColumn = 0;
  for (let offset = 0; offset < text.length; offset++) {
    if (visualColumn >= column) return offset;
    const next = text[offset] === "\t" ? visualColumn + tabSize - (visualColumn % tabSize) : visualColumn + 1;
    if (next > column) return offset;
    visualColumn = next;
  }
  return text.length;
}

function lineElementAt(view: EditorView, position: number): HTMLElement | null {
  const node = view.domAtPos(position).node;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(".cm-line") ?? null;
}

function indentLineDecoration(
  view: EditorView,
  line: { from: number; text: string },
  indentSize: number,
): Decoration | null {
  const columns = leadingIndentColumns(line.text, view.state.tabSize);
  const guideColumns = indentGuideColumns(columns, indentSize);
  if (guideColumns.length === 0) return null;

  const lineElement = lineElementAt(view, line.from);
  const lineLeft = lineElement?.getBoundingClientRect().left;
  if (lineLeft === undefined) return null;

  const positions: number[] = [];
  for (const column of guideColumns) {
    const offset = documentOffsetAtVisualColumn(line.text, column, view.state.tabSize);
    const cursorRect = view.coordsAtPos(line.from + offset);
    if (cursorRect) positions.push(cursorRect.left - lineLeft);
  }
  if (positions.length === 0) return null;

  const style = [
    `background-image: ${positions.map(() => "linear-gradient(var(--border), var(--border))").join(", ")}`,
    `background-size: ${positions.map(() => "1px 100%").join(", ")}`,
    `background-position: ${positions.map((left) => `${left}px 0`).join(", ")}`,
    "background-repeat: no-repeat",
  ].join("; ");

  return Decoration.line({ attributes: { class: "cm-indent-guide-line", style } });
}

function buildIndentGuideDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const indentSize = documentIndentSize(view);
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
      const decoration = indentLineDecoration(view, line, indentSize);
      if (decoration) builder.add(line.from, line.from, decoration);
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
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.decorations = buildIndentGuideDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export const indentGuideTheme = EditorView.baseTheme({
  ".cm-indent-guide-line": { backgroundRepeat: "no-repeat" },
});

export const indentGuides = [indentGuidePlugin, indentGuideTheme];
