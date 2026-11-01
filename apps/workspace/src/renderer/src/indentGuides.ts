import { indentUnit } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'

const INDENT_SIZE_CANDIDATES = [2, 4, 6, 8, 3, 5, 7]
const INDENT_SCAN_LIMIT = 10_000

function leadingIndentColumns(text: string, tabSize: number): number {
  let columns = 0
  for (const char of text) {
    if (char === ' ') columns++
    else if (char === '\t') columns += tabSize - (columns % tabSize)
    else break
  }
  return columns
}

interface IndentationGuess {
  indentSize: number
  insertSpaces: boolean
}

function indentationLength(text: string): number {
  let length = 0
  while (text[length] === ' ' || text[length] === '\t') length++
  return length
}

function indentationDifference(a: string, aLength: number, b: string, bLength: number) {
  let commonPrefixLength = 0
  while (
    commonPrefixLength < aLength &&
    commonPrefixLength < bLength &&
    a[commonPrefixLength] === b[commonPrefixLength]
  ) {
    commonPrefixLength++
  }

  let aSpaces = 0
  let aTabs = 0
  for (let i = commonPrefixLength; i < aLength; i++) {
    if (a[i] === ' ') aSpaces++
    else aTabs++
  }
  let bSpaces = 0
  let bTabs = 0
  for (let i = commonPrefixLength; i < bLength; i++) {
    if (b[i] === ' ') bSpaces++
    else bTabs++
  }

  if ((aSpaces > 0 && aTabs > 0) || (bSpaces > 0 && bTabs > 0)) {
    return { spaces: 0, looksLikeAlignment: false }
  }

  const tabsDifference = Math.abs(aTabs - bTabs)
  const spacesDifference = Math.abs(aSpaces - bSpaces)
  if (tabsDifference === 0) {
    const looksLikeAlignment =
      spacesDifference > 0 &&
      bSpaces - 1 >= 0 &&
      bSpaces - 1 < a.length &&
      bSpaces < b.length &&
      b.charCodeAt(bSpaces) !== 32 &&
      a.charCodeAt(bSpaces - 1) === 32 &&
      a.charCodeAt(a.length - 1) === 44
    return { spaces: spacesDifference, looksLikeAlignment }
  }
  if (spacesDifference % tabsDifference === 0) {
    return { spaces: spacesDifference / tabsDifference, looksLikeAlignment: false }
  }
  return { spaces: 0, looksLikeAlignment: false }
}

/** Port of VS Code's indentationGuesser: compare adjacent content lines,
 * ignore alignment-only continuation lines, and prefer its allowed sizes. */
export function detectIndentation(
  lines: Iterable<string>,
  defaultIndentSize: number,
  defaultInsertSpaces: boolean
): IndentationGuess {
  let tabsLines = 0
  let spacesLines = 0
  let previousText = ''
  let previousIndent = 0
  const differences = Array<number>(9).fill(0)

  for (const text of lines) {
    const currentIndent = indentationLength(text)
    if (currentIndent === text.length) continue

    const indentText = text.slice(0, currentIndent)
    if (indentText.includes('\t')) tabsLines++
    else if (indentText.length > 1) spacesLines++

    const difference = indentationDifference(previousText, previousIndent, text, currentIndent)
    if (
      difference.looksLikeAlignment &&
      !(defaultInsertSpaces && defaultIndentSize === difference.spaces)
    ) {
      continue
    }
    if (difference.spaces <= 8) differences[difference.spaces]++
    previousText = text
    previousIndent = currentIndent
  }

  let insertSpaces = defaultInsertSpaces
  if (tabsLines !== spacesLines) insertSpaces = tabsLines < spacesLines

  let indentSize = defaultIndentSize
  if (insertSpaces) {
    let bestScore = 0
    for (const candidate of INDENT_SIZE_CANDIDATES) {
      if (differences[candidate] > bestScore) {
        bestScore = differences[candidate]
        indentSize = candidate
      }
    }
    if (
      indentSize === 4 &&
      differences[4] > 0 &&
      differences[2] > 0 &&
      differences[2] >= (differences[4] * 2) / 3
    ) {
      indentSize = 2
    }
  }
  return { indentSize, insertSpaces }
}

/** VS Code places guides at the start of each indent level, never at the
 * current line's text start (the final indentation boundary). */
export function indentGuideColumns(indentColumns: number, indentSize: number): number[] {
  const count = Math.ceil(indentColumns / indentSize)
  return Array.from({ length: count }, (_unused, level) => level * indentSize)
}

function documentIndentSize(view: EditorView): number {
  const doc = view.state.doc
  const scanTo = Math.min(doc.lines, INDENT_SCAN_LIMIT)
  const lines: string[] = []
  for (let lineNumber = 1; lineNumber <= scanTo; lineNumber++) {
    lines.push(doc.line(lineNumber).text)
  }
  const configuredIndent = view.state.facet(indentUnit)
  const defaultInsertSpaces = !configuredIndent.includes('\t')
  const guess = detectIndentation(
    lines,
    configuredIndent.replaceAll('\t', '    ').length || view.state.tabSize,
    defaultInsertSpaces
  )
  return guess.insertSpaces ? guess.indentSize : view.state.tabSize
}

function documentOffsetAtVisualColumn(text: string, column: number, tabSize: number): number {
  let visualColumn = 0
  for (let offset = 0; offset < text.length; offset++) {
    if (visualColumn >= column) return offset
    const next =
      text[offset] === '\t' ? visualColumn + tabSize - (visualColumn % tabSize) : visualColumn + 1
    if (next > column) return offset
    visualColumn = next
  }
  return text.length
}

function lineElementAt(view: EditorView, position: number): HTMLElement | null {
  try {
    const node = view.domAtPos(position).node
    const element = node instanceof Element ? node : node.parentElement
    return element?.closest<HTMLElement>('.cm-line') ?? null
  } catch {
    // The editor can be mounted while its pane is hidden or before the first
    // DOM measurement. CSS-cell fallback below still paints guides then.
    return null
  }
}

function indentLineDecoration(
  line: { from: number; text: string },
  tabSize: number,
  indentSize: number,
  measuredPositions: Map<number, number[]>
): Decoration | null {
  const columns = leadingIndentColumns(line.text, tabSize)
  const guideColumns = indentGuideColumns(columns, indentSize)
  if (guideColumns.length === 0) return null

  const measured = measuredPositions.get(line.from)
  const positions = guideColumns.map((column, index) =>
    measured?.[index] === undefined ? `${column}ch` : `${measured[index]}px`
  )

  const style = [
    `background-image: ${positions.map(() => 'linear-gradient(var(--border), var(--border))').join(', ')}`,
    `background-size: ${positions.map(() => '1px 100%').join(', ')}`,
    `background-position: ${positions.map((left) => `${left} 0`).join(', ')}`,
    'background-repeat: no-repeat'
  ].join('; ')

  return Decoration.line({ attributes: { class: 'cm-indent-guide-line', style } })
}

function buildIndentGuideDecorations(
  view: EditorView,
  measuredPositions: Map<number, number[]>
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const indentSize = documentIndentSize(view)
  const doc = view.state.doc
  let lastLineFrom = -1
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      if (line.from === lastLineFrom) {
        pos = line.to + 1
        continue
      }
      lastLineFrom = line.from
      const decoration = indentLineDecoration(
        line,
        view.state.tabSize,
        indentSize,
        measuredPositions
      )
      if (decoration) builder.add(line.from, line.from, decoration)
      pos = line.to + 1
    }
  }
  return builder.finish()
}

const refreshMeasuredGuides = StateEffect.define<null>()

type GuideMeasurement = {
  doc: EditorView['state']['doc']
  positions: Map<number, number[]>
}

function measureGuidePositions(view: EditorView): GuideMeasurement {
  const positions = new Map<number, number[]>()
  const indentSize = documentIndentSize(view)
  const doc = view.state.doc
  let lastLineFrom = -1
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      if (line.from === lastLineFrom) {
        pos = line.to + 1
        continue
      }
      lastLineFrom = line.from
      const columns = leadingIndentColumns(line.text, view.state.tabSize)
      const guideColumns = indentGuideColumns(columns, indentSize)
      if (guideColumns.length > 0) {
        const lineElement = lineElementAt(view, line.from)
        if (lineElement) {
          const lineLeft = lineElement.getBoundingClientRect().left
          const measuredLine: number[] = []
          for (const column of guideColumns) {
            const offset = documentOffsetAtVisualColumn(line.text, column, view.state.tabSize)
            const cursorRect = view.coordsAtPos(line.from + offset)
            if (!cursorRect) break
            measuredLine.push(cursorRect.left - lineLeft)
          }
          if (measuredLine.length === guideColumns.length) positions.set(line.from, measuredLine)
        }
      }
      pos = line.to + 1
    }
  }
  return { doc, positions }
}

function sameMeasurements(a: Map<number, number[]>, b: Map<number, number[]>): boolean {
  if (a.size !== b.size) return false
  for (const [line, positions] of a) {
    const next = b.get(line)
    if (!next || positions.length !== next.length) return false
    if (positions.some((position, index) => Math.abs(position - next[index]) > 0.25)) return false
  }
  return true
}

export const indentGuidePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    private measuredPositions = new Map<number, number[]>()
    private destroyed = false
    constructor(view: EditorView) {
      this.decorations = buildIndentGuideDecorations(view, this.measuredPositions)
      this.scheduleMeasure(view)
    }
    update(update: ViewUpdate) {
      if (
        update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(refreshMeasuredGuides))
        )
      ) {
        this.decorations = buildIndentGuideDecorations(update.view, this.measuredPositions)
        return
      }
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.measuredPositions = new Map()
        this.decorations = buildIndentGuideDecorations(update.view, this.measuredPositions)
        this.scheduleMeasure(update.view)
      }
    }
    destroy() {
      this.destroyed = true
    }
    private scheduleMeasure(view: EditorView) {
      view.requestMeasure<GuideMeasurement>({
        key: this,
        read: measureGuidePositions,
        write: (measurement, measuredView) => {
          if (this.destroyed || measuredView.state.doc !== measurement.doc) return
          if (sameMeasurements(this.measuredPositions, measurement.positions)) return
          this.measuredPositions = measurement.positions
          queueMicrotask(() => {
            if (!this.destroyed) measuredView.dispatch({ effects: refreshMeasuredGuides.of(null) })
          })
        }
      })
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

export const indentGuideTheme = EditorView.baseTheme({
  '.cm-indent-guide-line': { backgroundRepeat: 'no-repeat' }
})

export const indentGuides = [indentGuidePlugin, indentGuideTheme]
