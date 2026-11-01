import { indentUnit } from "@codemirror/language";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const INDENT_SIZE_CANDIDATES = [2, 4, 6, 8, 3, 5, 7];
const INDENT_SCAN_LIMIT = 10_000;

function leadingIndentColumns(text: string, tabSize: number): number {
  let columns = 0;
  for (const char of text) {
    if (char === " ") columns++;
    else if (char === "\t") columns += tabSize - (columns % tabSize);
    else break;
  }
  return columns;
}

interface IndentationGuess {
  indentSize: number;
  insertSpaces: boolean;
}

function indentationLength(text: string): number {
  let length = 0;
  while (text[length] === " " || text[length] === "\t") length++;
  return length;
}

function indentationDifference(a: string, aLength: number, b: string, bLength: number) {
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < aLength &&
    commonPrefixLength < bLength &&
    a[commonPrefixLength] === b[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  let aSpaces = 0;
  let aTabs = 0;
  for (let i = commonPrefixLength; i < aLength; i++) {
    if (a[i] === " ") aSpaces++;
    else aTabs++;
  }
  let bSpaces = 0;
  let bTabs = 0;
  for (let i = commonPrefixLength; i < bLength; i++) {
    if (b[i] === " ") bSpaces++;
    else bTabs++;
  }

  if ((aSpaces > 0 && aTabs > 0) || (bSpaces > 0 && bTabs > 0)) {
    return { spaces: 0, looksLikeAlignment: false };
  }

  const tabsDifference = Math.abs(aTabs - bTabs);
  const spacesDifference = Math.abs(aSpaces - bSpaces);
  if (tabsDifference === 0) {
    const looksLikeAlignment =
      spacesDifference > 0 &&
      bSpaces - 1 >= 0 &&
      bSpaces - 1 < a.length &&
      bSpaces < b.length &&
      b.charCodeAt(bSpaces) !== 32 &&
      a.charCodeAt(bSpaces - 1) === 32 &&
      a.charCodeAt(a.length - 1) === 44;
    return { spaces: spacesDifference, looksLikeAlignment };
  }
  if (spacesDifference % tabsDifference === 0) {
    return { spaces: spacesDifference / tabsDifference, looksLikeAlignment: false };
  }
  return { spaces: 0, looksLikeAlignment: false };
}

/** Port of VS Code's indentationGuesser: compare adjacent content lines,
 * ignore alignment-only continuation lines, and prefer its allowed sizes. */
export function detectIndentation(
  lines: Iterable<string>,
  defaultIndentSize: number,
  defaultInsertSpaces: boolean,
): IndentationGuess {
  let tabsLines = 0;
  let spacesLines = 0;
  let previousText = "";
  let previousIndent = 0;
  const differences = Array<number>(9).fill(0);

  for (const text of lines) {
    const currentIndent = indentationLength(text);
    if (currentIndent === text.length) continue;

    const indentText = text.slice(0, currentIndent);
    if (indentText.includes("\t")) tabsLines++;
    else if (indentText.length > 1) spacesLines++;

    const difference = indentationDifference(previousText, previousIndent, text, currentIndent);
    if (
      difference.looksLikeAlignment &&
      !(defaultInsertSpaces && defaultIndentSize === difference.spaces)
    ) {
      continue;
    }
    if (difference.spaces <= 8) differences[difference.spaces]++;
    previousText = text;
    previousIndent = currentIndent;
  }

  let insertSpaces = defaultInsertSpaces;
  if (tabsLines !== spacesLines) insertSpaces = tabsLines < spacesLines;

  let indentSize = defaultIndentSize;
  if (insertSpaces) {
    let bestScore = 0;
    for (const candidate of INDENT_SIZE_CANDIDATES) {
      if (differences[candidate] > bestScore) {
        bestScore = differences[candidate];
        indentSize = candidate;
      }
    }
    if (
      indentSize === 4 &&
      differences[4] > 0 &&
      differences[2] > 0 &&
      differences[2] >= (differences[4] * 2) / 3
    ) {
      indentSize = 2;
    }
  }
  return { indentSize, insertSpaces };
}

/** VS Code places guides at the start of each indent level, never at the
 * current line's text start (the final indentation boundary). */
export function indentGuideColumns(indentColumns: number, indentSize: number): number[] {
  const count = Math.ceil(indentColumns / indentSize);
  return Array.from({ length: count }, (_unused, level) => level * indentSize);
}

function documentIndentSize(view: EditorView): number {
  const doc = view.state.doc;
  const scanTo = Math.min(doc.lines, INDENT_SCAN_LIMIT);
  const lines: string[] = [];
  for (let lineNumber = 1; lineNumber <= scanTo; lineNumber++) {
    lines.push(doc.line(lineNumber).text);
  }
  const configuredIndent = view.state.facet(indentUnit);
  const defaultInsertSpaces = !configuredIndent.includes("\t");
  const guess = detectIndentation(
    lines,
    configuredIndent.replaceAll("\t", "    ").length || view.state.tabSize,
    defaultInsertSpaces,
  );
  return guess.insertSpaces ? guess.indentSize : view.state.tabSize;
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
