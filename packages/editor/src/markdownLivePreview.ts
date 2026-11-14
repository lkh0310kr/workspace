import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import {
  Facet,
  RangeSetBuilder,
  StateField,
  type EditorState,
  type Extension
} from '@codemirror/state'
import type { SyntaxNodeRef } from '@lezer/common'
import katex from 'katex'
import { dispatchEditorNotification } from './editorNotifications'

// Per-view configuration carrying the active tab's root_path and document
// path, so relative images resolve beside the Markdown file and root-relative
// images resolve from the workspace. Facets are used because the ViewPlugins
// below are built once as static extensions, not per-pane factories; include
// `markdownRootPath.of(rootPath)` in the EditorView's own extensions to
// set it.
export const markdownRootPath = Facet.define<string, string>({
  combine: (values) => values[0] ?? ''
})

/** Current provider-relative document path for resolving relative media URLs. */
export const markdownDocumentPath = Facet.define<string, string>({
  combine: (values) => values[0] ?? ''
})

export interface MarkdownImageResource {
  src: string
  release?: () => void
}

export type MarkdownImageResolver = (
  url: string
) => Promise<MarkdownImageResource | null> | MarkdownImageResource | null

/** Optional host resolver for providers whose assets need authenticated async loading. */
export const markdownImageResolver = Facet.define<
  MarkdownImageResolver,
  MarkdownImageResolver | null
>({
  combine: (values) => values[0] ?? null
})

// Tauri's convertFileSrc (routed through a registered asset-protocol Scope
// per tab root_path, src/lib.rs's allow_asset_scope) has no Electron
// equivalent in use here — the renderer isn't sandboxed against the
// filesystem the way a Tauri asset scope is, so a plain `file://` URL
// works directly. Path segments are encoded individually (not the whole
// path — encodeURIComponent would also escape the `/` separators).
function resolveImageSrc(rootPath: string, url: string, documentPath: string): string | null {
  if (/^(?:https?:\/\/|data:image\/|blob:)/i.test(url)) return url
  if (!rootPath) return null
  const normalizedUrl = url.replace(/\\/g, '/')
  const rootRelative = normalizedUrl.startsWith('/')
  const cleaned = normalizedUrl.replace(/^\/+/, '')
  const normalizedDocument = documentPath.replace(/\\/g, '/')
  const documentDirectory = normalizedDocument.includes('/')
    ? normalizedDocument.slice(0, normalizedDocument.lastIndexOf('/'))
    : ''
  const relativePath = rootRelative
    ? cleaned
    : [documentDirectory, cleaned].filter(Boolean).join('/')
  const fullPath = `${rootPath.replace(/\\/g, '/').replace(/\/+$/, '')}/${relativePath}`
  const encodedPath = fullPath
    .split('/')
    .map((part, index) => (index === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)))
    .join('/')
  return `file://${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`
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

const HIDE = Decoration.replace({})

function buildFrontmatterDecorations(state: EditorState): DecorationSet {
  const doc = state.doc
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return Decoration.none
  let close = 0
  for (let number = 2; number <= doc.lines; number++) {
    if (/^(---|\.\.\.)\s*$/.test(doc.line(number).text)) {
      close = number
      break
    }
  }
  if (!close) return Decoration.none
  const end = doc.line(close).to
  if (selectionOverlaps(state, 0, end)) return Decoration.none
  return Decoration.set([Decoration.replace({ block: true }).range(0, end)])
}

const frontmatterDecorations = StateField.define<DecorationSet>({
  create: buildFrontmatterDecorations,
  update: (decorations, transaction) =>
    transaction.docChanged || transaction.selection
      ? buildFrontmatterDecorations(transaction.state)
      : decorations.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field)
})

export const HEADING_TYPES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6'
])

function selectionOverlaps(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true
  }
  return false
}

const CALLOUT_MARKER_RE = /^\[!([\w-]+)\]/

const CALLOUT_LABELS: Record<string, string> = {
  note: 'Note',
  info: 'Info',
  tip: 'Tip',
  success: 'Success',
  question: 'Question',
  warning: 'Warning',
  danger: 'Danger',
  failure: 'Failure',
  bug: 'Bug',
  example: 'Example',
  quote: 'Quote'
}

// Obsidian's callout syntax (`> [!note] Title`) is just a regular
// blockquote whose first line happens to start with `[!type]` — there's
// no dedicated syntax-tree node for it, so both decoration passes below
// detect it the same way from a Blockquote node's first QuoteMark.
function calloutMarkerRange(
  view: EditorView,
  node: SyntaxNodeRef
): { type: string; from: number; to: number } | null {
  const firstMark = node.node.getChild('QuoteMark')
  if (!firstMark) return null
  const line = view.state.doc.lineAt(firstMark.from)
  let contentStart = firstMark.to
  if (view.state.doc.sliceString(contentStart, contentStart + 1) === ' ') contentStart += 1
  const match = CALLOUT_MARKER_RE.exec(view.state.doc.sliceString(contentStart, line.to))
  if (!match) return null
  return { type: match[1].toLowerCase(), from: contentStart, to: contentStart + match[0].length }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly markerFrom: number,
    readonly checked: boolean
  ) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.markerFrom === this.markerFrom
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
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-md-task-checkbox'
    box.addEventListener('click', (event) => {
      const pos = this.markerFrom + 1
      const current = view.state.doc.sliceString(pos, pos + 1)
      const insert = current.toLowerCase() === 'x' ? ' ' : 'x'
      view.dispatch({ changes: { from: pos, to: pos + 1, insert } })
      // Stops the click from also reaching CodeMirror's own default click
      // handling (which places the text cursor at the click position) —
      // `ignoreEvent` below only silences `mousedown`, not `click`.
      event.preventDefault()
      event.stopPropagation()
    })
    return box
  }

  // Ignoring only `mousedown` (not `click`) matches Zettlr's widget —
  // `click`'s own default action (cursor placement) is instead suppressed
  // per-toggle by this widget's own listener above via preventDefault/
  // stopPropagation, rather than by blanket-ignoring every event type.
  ignoreEvent(event: Event) {
    return event instanceof MouseEvent && event.type === 'mousedown'
  }
}

class CalloutLabelWidget extends WidgetType {
  constructor(readonly calloutType: string) {
    super()
  }

  eq(other: CalloutLabelWidget) {
    return other.calloutType === this.calloutType
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = `cm-md-callout-label cm-md-callout-${this.calloutType}`
    span.textContent = CALLOUT_LABELS[this.calloutType] ?? this.calloutType
    return span
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '•'
    return span
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly rawSrc: string,
    readonly resolver: MarkdownImageResolver | null,
    readonly rootPath: string,
    readonly documentPath: string
  ) {
    super()
  }

  eq(other: ImageWidget) {
    return (
      other.rawSrc === this.rawSrc &&
      other.resolver === this.resolver &&
      other.rootPath === this.rootPath &&
      other.documentPath === this.documentPath
    )
  }

  toDOM() {
    const img = document.createElement('img')
    img.loading = 'lazy'
    img.className = 'cm-md-image'
    const state: { disposed: boolean; release?: () => void } = { disposed: false }
    imageWidgetStates.set(img, state)
    Promise.resolve()
      .then(() => this.resolver?.(this.rawSrc) ?? null)
      .then((resource) => {
        const src = resource?.src ?? resolveImageSrc(this.rootPath, this.rawSrc, this.documentPath)
        if (!src || state.disposed) {
          resource?.release?.()
          if (!state.disposed) img.hidden = true
          return
        }
        state.release = resource?.release
        img.src = src
      })
      .catch(() => {
        if (!state.disposed) img.hidden = true
      })
    return img
  }

  destroy(dom: HTMLElement): void {
    const img = dom as HTMLImageElement
    const state = imageWidgetStates.get(img)
    if (!state) return
    state.disposed = true
    state.release?.()
    imageWidgetStates.delete(img)
  }
}

const imageWidgetStates = new WeakMap<
  HTMLImageElement,
  { disposed: boolean; release?: () => void }
>()

function insideDisplayMath(state: EditorState, position: number): boolean {
  const targetLine = state.doc.lineAt(position).number
  let closeMarker: string | null = null
  for (let number = 1; number <= targetLine; number++) {
    const line = state.doc.line(number)
    let syntax = syntaxTree(state).resolveInner(line.from, 1)
    let isFencedCode = false
    while (syntax) {
      if (syntax.type.name === 'FencedCode') {
        isFencedCode = true
        break
      }
      if (!syntax.parent) break
      syntax = syntax.parent
    }
    if (isFencedCode) continue
    const text = line.text.trim()
    if (!closeMarker) {
      if (text === '$$') closeMarker = '$$'
      else if (text === '\\[') closeMarker = '\\]'
    } else if (text === closeMarker) {
      closeMarker = null
    }
  }
  return closeMarker !== null
}

function insideTable(state: EditorState, position: number): boolean {
  let node = syntaxTree(state).resolveInner(position, 1)
  while (node) {
    if (node.type.name === 'Table') return true
    if (!node.parent) break
    node = node.parent
  }
  return false
}

// Rendered via a block-replace decoration (`block: true`) — unlike
// HorizontalRule, a table genuinely spans multiple lines, and CodeMirror
// only allows a replace decoration to cross a line break when it's
// marked block. That in turn requires the replaced range to span exactly
// from one line's start to another line's end; the call site verifies
// that against the document's actual line boundaries before using this
// widget, rather than assuming the parser guarantees it.
interface TableCellSourceRange {
  from: number
  to: number
}

function tableBoundsAt(state: EditorState, position: number): { from: number; to: number } | null {
  let bounds: { from: number; to: number } | null = null
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.type.name === 'Table' && node.from <= position && position <= node.to) {
        bounds = { from: node.from, to: node.to }
        return false
      }
      return true
    }
  })
  return bounds
}

class TableWidget extends WidgetType {
  constructor(
    readonly header: string[],
    readonly rows: string[][],
    readonly alignments: Array<'left' | 'center' | 'right'>,
    readonly widths: number[],
    readonly sourceFrom: number,
    readonly sourceTo: number,
    readonly headerRanges: TableCellSourceRange[],
    readonly rowRanges: TableCellSourceRange[][]
  ) {
    super()
  }

  eq(other: TableWidget) {
    return (
      JSON.stringify(other.header) === JSON.stringify(this.header) &&
      JSON.stringify(other.rows) === JSON.stringify(this.rows) &&
      JSON.stringify(other.alignments) === JSON.stringify(this.alignments) &&
      JSON.stringify(other.widths) === JSON.stringify(this.widths) &&
      other.sourceFrom === this.sourceFrom &&
      other.sourceTo === this.sourceTo &&
      JSON.stringify(other.headerRanges) === JSON.stringify(this.headerRanges) &&
      JSON.stringify(other.rowRanges) === JSON.stringify(this.rowRanges)
    )
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-md-table-wrap'
    wrapper.dataset.tableFrom = String(this.sourceFrom)
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    table.style.tableLayout = this.widths.length ? 'fixed' : 'auto'
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    const columnCount = Math.max(this.header.length, ...this.rows.map((row) => row.length))
    const colgroup = document.createElement('colgroup')
    for (let index = 0; index < columnCount; index++) {
      const col = document.createElement('col')
      if (this.widths.length === columnCount) col.style.width = `${this.widths[index]}%`
      colgroup.appendChild(col)
    }
    table.appendChild(colgroup)
    if (this.widths.length === columnCount) table.style.width = '100%'
    for (let index = 0; index < columnCount; index++) {
      const cell = this.header[index] ?? ''
      const th = document.createElement('th')
      th.style.textAlign = this.alignments[index] ?? 'left'
      appendTableCellContent(th, cell)
      if (index < columnCount - 1) {
        const handle = document.createElement('span')
        handle.className = 'cm-md-table-resize-handle'
        handle.setAttribute('role', 'separator')
        handle.setAttribute('aria-orientation', 'vertical')
        handle.setAttribute('aria-label', `Resize table column ${index + 1}`)
        handle.addEventListener('pointerdown', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const tableWidth = table.getBoundingClientRect().width
          if (!tableWidth) return
          const startX = event.clientX
          const initial =
            this.widths.length === columnCount
              ? [...this.widths]
              : Array.from(
                  table.querySelectorAll('th'),
                  (headerCell) => (headerCell.getBoundingClientRect().width / tableWidth) * 100
                )
          const initialLeft = initial[index]
          const minWidth = (80 / tableWidth) * 100
          const cols = Array.from(table.querySelectorAll('col'))
          const apply = (left: number) => {
            if (!cols.length) return
            const pairTotal = initial[index] + initial[index + 1]
            const leftWidth = Math.max(minWidth, Math.min(pairTotal - minWidth, left))
            initial[index] = leftWidth
            initial[index + 1] = pairTotal - leftWidth
            table.style.tableLayout = 'fixed'
            table.style.width = '100%'
            cols.forEach((col, colIndex) => {
              col.style.width = `${initial[colIndex]}%`
            })
          }
          apply(initial[index])
          const move = (moveEvent: PointerEvent) =>
            apply(initialLeft + ((moveEvent.clientX - startX) / tableWidth) * 100)
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            writeTableWidths(view, this.sourceTo, initial)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up, { once: true })
        })
        th.appendChild(handle)
      }
      headRow.appendChild(th)
    }
    thead.appendChild(headRow)
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    for (const row of this.rows) {
      const tr = document.createElement('tr')
      for (let index = 0; index < columnCount; index++) {
        const cell = row[index] ?? ''
        const td = document.createElement('td')
        td.style.textAlign = this.alignments[index] ?? 'left'
        appendTableCellContent(td, cell)
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    const allRanges = [...this.headerRanges, ...this.rowRanges.flat()]
    let activeCell: HTMLElement | null = null
    const activateCell = (cell: HTMLElement, ordinal: number) => {
      const range = allRanges[ordinal]
      if (!range || !wrapper.isConnected) return
      const raw = view.state.doc.sliceString(range.from, range.to)
      activeCell = cell
      cell.contentEditable = 'true'
      cell.setAttribute('role', 'textbox')
      cell.setAttribute('aria-label', `Edit table cell ${ordinal + 1}`)
      cell.tabIndex = 0
      cell.textContent = raw
      cell.focus({ preventScroll: true })
      cell.addEventListener('keydown', (keyEvent) => {
        if (keyEvent.key === 'Enter') {
          keyEvent.preventDefault()
          cell.blur()
        }
        if (keyEvent.key === 'Tab') {
          keyEvent.preventDefault()
          const backward = keyEvent.shiftKey
          const nextOrdinal = ordinal + (backward ? -1 : 1)
          const leaveTable = nextOrdinal < 0 || nextOrdinal >= allRanges.length
          cell.blur()
          requestAnimationFrame(() => {
            if (leaveTable) {
              const table = tableBoundsAt(view.state, this.sourceFrom + 1)
              if (!table) return
              const appendLineBreak = !backward && table.to === view.state.doc.length
              const target = backward
                ? Math.max(0, table.from - 1)
                : Math.min(table.to + 1, view.state.doc.length)
              view.dispatch({
                ...(appendLineBreak ? { changes: { from: table.to, insert: '\n' } } : {}),
                selection: { anchor: target + (appendLineBreak ? 1 : 0) },
                scrollIntoView: true
              })
              view.focus()
              return
            }
            const freshWrapper =
              view.dom.querySelector<HTMLElement>(
                `.cm-md-table-wrap[data-table-from="${this.sourceFrom}"]`
              ) ?? wrapper
            const freshCell = freshWrapper.querySelectorAll<HTMLElement>('th, td')[nextOrdinal]
            if (freshCell) activateCell(freshCell, nextOrdinal)
          })
        }
      })
      cell.addEventListener(
        'blur',
        () => {
          const edited = cell.textContent?.replace(/\r?\n/g, ' ') ?? ''
          const escaped = edited.replace(/\\?\|/g, (pipe) => (pipe.startsWith('\\') ? pipe : '\\|'))
          if (edited === raw) {
            cell.contentEditable = 'false'
            cell.removeAttribute('role')
            cell.removeAttribute('aria-label')
            cell.removeAttribute('tabindex')
            cell.replaceChildren()
            appendTableCellContent(cell, raw)
          } else if (range.to <= view.state.doc.length) {
            const scroll = view.dom.closest<HTMLElement>('.editor-markdown-scroll')
            const top = scroll?.scrollTop ?? 0
            const left = scroll?.scrollLeft ?? 0
            view.dispatch({ changes: { from: range.from, to: range.to, insert: escaped } })
            if (scroll)
              requestAnimationFrame(() => {
                scroll.scrollTop = top
                scroll.scrollLeft = left
              })
          }
          if (activeCell === cell) activeCell = null
        },
        { once: true }
      )
    }
    table.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.cm-md-table-resize-handle'))
        return
      const target = event.target instanceof Element ? event.target.closest('th, td') : null
      const row = target?.parentElement
      if (!target || !row) return
      const column = Array.prototype.indexOf.call(row.children, target) as number
      const rowIndex = Array.prototype.indexOf.call(tbody.children, row) as number
      const ordinal =
        row.parentElement === thead
          ? column
          : this.headerRanges.length +
            this.rowRanges.slice(0, rowIndex).reduce((total, cells) => total + cells.length, 0) +
            column
      const range = allRanges[ordinal]
      if (!range) return
      event.preventDefault()
      if (target === activeCell) return
      if (activeCell) {
        activeCell.blur()
        if (!wrapper.isConnected) {
          requestAnimationFrame(() => {
            const freshWrapper = view.dom.querySelector<HTMLElement>(
              `.cm-md-table-wrap[data-table-from="${this.sourceFrom}"]`
            )
            const freshCell = freshWrapper?.querySelectorAll<HTMLElement>('th, td')[ordinal]
            if (freshCell) activateCell(freshCell, ordinal)
          })
          return
        }
      }
      activateCell(target as HTMLElement, ordinal)
    })
    wrapper.appendChild(table)
    return wrapper
  }

  ignoreEvent(): boolean {
    return true
  }
}

function readTableWidths(state: EditorState, tableEnd: number, columns: number): number[] {
  const endLine = state.doc.lineAt(tableEnd)
  const metadataLine = endLine.number < state.doc.lines ? state.doc.line(endLine.number + 1) : null
  const match = metadataLine?.text.match(/^\s*<!-- workspace-table-widths: ([\d., ]+) -->\s*$/)
  if (!match) return []
  const values = match[1].split(',').map(Number)
  return values.length === columns && values.every((value) => Number.isFinite(value) && value > 0)
    ? values.map((value) => (value / values.reduce((sum, item) => sum + item, 0)) * 100)
    : []
}

function writeTableWidths(view: EditorView, sourceTo: number, widths: number[]): void {
  const doc = view.state.doc
  const endLine = doc.lineAt(sourceTo)
  const nextLine = endLine.number < doc.lines ? doc.line(endLine.number + 1) : null
  const metadata = `<!-- workspace-table-widths: ${widths.map((width) => Math.round(width)).join(',')} -->`
  const current = nextLine?.text.match(/^\s*<!-- workspace-table-widths: [\d., ]+ -->\s*$/)
  const scroll = view.dom.closest<HTMLElement>('.editor-markdown-scroll')
  const top = scroll?.scrollTop ?? 0
  const left = scroll?.scrollLeft ?? 0
  if (current && nextLine)
    view.dispatch({ changes: { from: nextLine.from, to: nextLine.to, insert: metadata } })
  else {
    const prefix = endLine.to < doc.length ? '\n' : '\n\n'
    view.dispatch({ changes: { from: endLine.to, insert: `${prefix}${metadata}` } })
  }
  if (scroll)
    requestAnimationFrame(() => {
      scroll.scrollTop = top
      scroll.scrollLeft = left
    })
}

function isEscapedAt(source: string, index: number): boolean {
  let count = 0
  while (index > count && source[index - count - 1] === '\\') count++
  return count % 2 === 1
}

function appendTableCellContent(target: HTMLElement, source: string): void {
  let plainStart = 0
  const appendPlain = (text: string) =>
    appendTableInlineFormatting(target, text.replace(/\\\|/g, '|'))
  for (let start = 0; start < source.length; start++) {
    if (source[start] === '`' && !isEscapedAt(source, start)) {
      const close = source.indexOf('`', start + 1)
      if (close > start + 1 && !isEscapedAt(source, close)) {
        appendPlain(source.slice(plainStart, start))
        const code = document.createElement('code')
        code.textContent = source.slice(start + 1, close).replace(/\\\|/g, '|')
        target.appendChild(code)
        plainStart = close + 1
        start = close
        continue
      }
    }
    if (
      source[start] !== '$' ||
      isEscapedAt(source, start) ||
      source[start - 1] === '$' ||
      source[start + 1] === '$' ||
      /\s/.test(source[start + 1] ?? '')
    )
      continue
    let close = start + 1
    while (close < source.length && (source[close] !== '$' || isEscapedAt(source, close))) close++
    if (
      close >= source.length ||
      close === start + 1 ||
      source[close - 1] === '$' ||
      /\s/.test(source[close - 1])
    )
      continue
    appendPlain(source.slice(plainStart, start))
    target.appendChild(new InlineMathWidget(source.slice(start + 1, close)).toDOM())
    plainStart = close + 1
    start = close
  }
  appendPlain(source.slice(plainStart))
}

function appendTableInlineFormatting(target: HTMLElement, source: string): void {
  const pattern = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g
  const appendInline = (text: string) => {
    let cursor = 0
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0
      target.appendChild(document.createTextNode(text.slice(cursor, index)))
      const element = document.createElement(
        match[1] || match[2] ? 'strong' : match[3] ? 'del' : 'em'
      )
      element.textContent = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? ''
      target.appendChild(element)
      cursor = index + match[0].length
    }
    target.appendChild(document.createTextNode(text.slice(cursor)))
  }

  const breaks = /<br\s*\/?>/gi
  let cursor = 0
  for (const match of source.matchAll(breaks)) {
    const index = match.index ?? 0
    appendInline(source.slice(cursor, index))
    target.appendChild(document.createElement('br'))
    cursor = index + match[0].length
  }
  appendInline(source.slice(cursor))
}

function splitMarkdownTableRowDetailed(
  source: string,
  baseFrom: number
): Array<{ text: string; from: number; to: number }> {
  const leftTrim = source.length - source.trimStart().length
  const rightTrim = source.trimEnd().length
  const row = source.slice(leftTrim, rightTrim)
  let start = row.startsWith('|') ? 1 : 0
  const cells: Array<{ text: string; from: number; to: number }> = []
  let cellStart = start
  const pushCell = (from: number, to: number) => {
    const content = row.slice(from, to)
    const contentLeft = content.length - content.trimStart().length
    const contentRight = content.trimEnd().length
    const text = content.trim()
    cells.push({
      text,
      from: baseFrom + leftTrim + from + contentLeft,
      to: baseFrom + leftTrim + from + contentRight
    })
  }
  for (let index = start; index < row.length; index++) {
    if (row[index] !== '|' || isEscapedAt(row, index)) continue
    pushCell(cellStart, index)
    cellStart = index + 1
  }
  if (cellStart < row.length) pushCell(cellStart, row.length)
  return cells
}

function splitMarkdownTableRow(source: string): string[] {
  return splitMarkdownTableRowDetailed(source, 0).map((cell) => cell.text)
}

export function markdownTableCellRangesAt(
  state: EditorState,
  position: number
): TableCellSourceRange[] | null {
  let node = syntaxTree(state).resolveInner(position, 1)
  while (node && node.type.name !== 'Table') {
    if (!node.parent) return null
    node = node.parent
  }
  if (!node || node.type.name !== 'Table') return null
  const header = node.getChild('TableHeader')
  if (!header) return null
  const ranges = splitMarkdownTableRowDetailed(
    state.doc.sliceString(header.from, header.to),
    header.from
  ).map(({ from, to }) => ({ from, to }))
  for (const row of node.getChildren('TableRow')) {
    ranges.push(
      ...splitMarkdownTableRowDetailed(state.doc.sliceString(row.from, row.to), row.from).map(
        ({ from, to }) => ({ from, to })
      )
    )
  }
  return ranges
}

class HtmlBlockWidget extends WidgetType {
  constructor(readonly html: string) {
    super()
  }

  eq(other: HtmlBlockWidget): boolean {
    return other.html === this.html
  }

  toDOM(): HTMLIFrameElement {
    const frame = document.createElement('iframe')
    frame.className = 'cm-md-html-embed'
    frame.title = 'Embedded HTML preview'
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.setAttribute('scrolling', 'no')
    const hostStyle = getComputedStyle(document.documentElement)
    const textColor = hostStyle.getPropertyValue('--text').trim() || '#d4d4d4'
    const background = hostStyle.getPropertyValue('--bg-base').trim() || 'transparent'
    const csp =
      "default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;padding:0;overflow:hidden}body{color:${textColor};background:${background};font:14px/1.5 system-ui,sans-serif}img,video,iframe{max-width:100%}</style></head><body>${sanitizeHtmlBlock(this.html)}</body></html>`

    let observer: ResizeObserver | null = null
    const resize = () => {
      try {
        const doc = frame.contentDocument
        if (!doc) return
        const height = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
          doc.documentElement.getBoundingClientRect().height
        )
        frame.style.height = `${Math.min(Math.max(height, 32), 2400)}px`
      } catch {
        // The iframe remains scrollable if its document cannot be measured.
      }
    }
    frame.addEventListener('load', resize)
    observer = new ResizeObserver(resize)
    htmlFrameObservers.set(frame, observer)
    frame.addEventListener('load', () => {
      try {
        if (frame.contentDocument?.documentElement)
          observer?.observe(frame.contentDocument.documentElement)
      } catch {
        // Keep the initial height when the embedded document is inaccessible.
      }
    })
    frame.style.height = '120px'
    return frame
  }

  destroy(dom: HTMLElement): void {
    const observer = htmlFrameObservers.get(dom as HTMLIFrameElement)
    observer?.disconnect()
    htmlFrameObservers.delete(dom as HTMLIFrameElement)
  }

  ignoreEvent(): boolean {
    return true
  }
}

class InlineMathWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly display = false
  ) {
    super()
  }

  eq(other: InlineMathWidget): boolean {
    return other.source === this.source && other.display === this.display
  }

  toDOM(): HTMLElement {
    const span = document.createElement(this.display ? 'div' : 'span')
    span.className = this.display ? 'cm-md-math-block' : 'cm-md-math'
    try {
      span.innerHTML = katex.renderToString(this.source, {
        displayMode: this.display,
        output: 'htmlAndMathml',
        strict: 'ignore',
        throwOnError: false,
        trust: false,
        maxExpand: 1000,
        maxSize: 20
      })
    } catch {
      span.classList.add('cm-md-math-error')
      span.textContent = this.display ? `$$\n${this.source}\n$$` : `$${this.source}$`
    }
    return span
  }
}

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null
let mermaidRenderQueue: Promise<unknown> = Promise.resolve()
let mermaidId = 0
let mermaidInitialized = false
const mermaidWidgetStates = new WeakMap<HTMLElement, { disposed: boolean }>()

/**
 * Mermaid requires quotes around flowchart labels containing a colon. Many
 * Markdown authors write the common `A[Title: detail]` form, so normalize
 * that label only for rendering while leaving the stored source untouched.
 */
function normalizeMermaidFlowchartLabels(source: string): string {
  return source.replace(
    /(^|[^\w])([A-Za-z_][\w-]*)\[([^\]\n]*)\]/gm,
    (match, prefix: string, id: string, label: string) => {
      const trimmed = label.trim()
      if (!label.includes(':') || /^["'`]/.test(trimmed)) return match
      const escaped = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      return `${prefix}${id}["${escaped}"]`
    }
  )
}

function renderMermaid(source: string, id: string) {
  const render = mermaidRenderQueue.then(async () => {
    mermaidModulePromise ??= import('mermaid')
    const mermaid = (await mermaidModulePromise).default
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        htmlLabels: false,
        maxTextSize: 20000,
        maxEdges: 300,
        theme: 'base',
        themeVariables: {
          background: '#ffffff',
          primaryColor: '#f0f1f5',
          primaryTextColor: '#232428',
          primaryBorderColor: '#80838d',
          lineColor: '#5a5d66',
          secondaryColor: '#f7f7f9',
          tertiaryColor: '#ffffff',
          fontFamily: 'system-ui, sans-serif'
        }
      })
      mermaidInitialized = true
    }
    return mermaid.render(id, normalizeMermaidFlowchartLabels(source))
  })
  mermaidRenderQueue = render.then(
    () => undefined,
    () => undefined
  )
  return render
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-md-mermaid'
    const state = { disposed: false }
    mermaidWidgetStates.set(container, state)
    const showSource = () => {
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true })
      view.focus()
    }
    const error = (message: string) => {
      container.replaceChildren()
      container.classList.add('is-error')
      const label = document.createElement('span')
      label.textContent = message
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Show source'
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', showSource)
      container.appendChild(label)
      container.appendChild(button)
    }
    if (this.source.length > 20000) {
      error('Diagram exceeds the 20,000 character preview limit.')
      return container
    }
    const id = `workspace-mermaid-${++mermaidId}`
    void renderMermaid(this.source, id)
      .then(({ svg }) => {
        if (!state.disposed) container.innerHTML = svg
      })
      .catch((cause: unknown) => {
        if (!state.disposed)
          error(
            cause instanceof Error ? cause.message.slice(0, 240) : 'Diagram could not be rendered.'
          )
      })
    return container
  }

  destroy(dom: HTMLElement): void {
    const state = mermaidWidgetStates.get(dom)
    if (state) state.disposed = true
    mermaidWidgetStates.delete(dom)
  }
}

class CodeBlockHeaderWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly source: string
  ) {
    super()
  }

  eq(other: CodeBlockHeaderWidget): boolean {
    return other.language === this.language && other.source === this.source
  }

  toDOM(): HTMLElement {
    const header = document.createElement('div')
    header.className = 'cm-md-codeblock-header'
    const label = document.createElement('button')
    label.type = 'button'
    label.className = 'cm-md-codeblock-language'
    label.textContent = this.language || 'Code'
    const language = this.language || 'code'
    const copyLabel = `Copy ${language} code`
    label.setAttribute('aria-label', copyLabel)
    label.title = copyLabel
    label.addEventListener('click', () => {
      const clipboard = navigator.clipboard
      if (!clipboard) {
        label.classList.add('is-copied')
        label.setAttribute('aria-label', `Could not copy ${language} code`)
        label.title = 'Clipboard access failed'
        dispatchEditorNotification({ message: 'Could not copy code to clipboard', kind: 'error' })
        window.setTimeout(() => label.classList.remove('is-copied'), 900)
        return
      }
      label.classList.add('is-copied')
      void clipboard
        .writeText(this.source)
        .then(() => {
          label.setAttribute('aria-label', `Copied ${language} code`)
          label.title = `Copied ${language} code`
          dispatchEditorNotification({
            message: `Copied ${language} code to clipboard`,
            kind: 'success'
          })
        })
        .catch(() => {
          label.setAttribute('aria-label', `Could not copy ${language} code`)
          label.title = 'Clipboard access failed'
          dispatchEditorNotification({ message: 'Could not copy code to clipboard', kind: 'error' })
        })
        .finally(() => {
          window.setTimeout(() => {
            label.classList.remove('is-copied')
            label.setAttribute('aria-label', copyLabel)
            label.title = copyLabel
          }, 900)
        })
    })
    header.appendChild(label)
    return header
  }

  ignoreEvent(): boolean {
    return true
  }
}

function mermaidSource(state: EditorState, node: SyntaxNodeRef): string | null {
  const info = node.node.getChild('CodeInfo')
  if (
    !info ||
    state.doc.sliceString(info.from, info.to).trim().split(/\s+/, 1)[0]?.toLowerCase() !== 'mermaid'
  )
    return null
  const raw = state.doc.sliceString(node.from, node.to)
  const newline = raw.indexOf('\n')
  if (newline < 0) return ''
  let source = raw.slice(newline + 1)
  const firstLine = raw.slice(0, newline)
  const fence = firstLine.match(/^\s*(`{3,}|~{3,})/)?.[1]
  if (fence) {
    const close = new RegExp(`\\n\\s*${fence[0]}{${fence.length},}\\s*$`)
    source = source.replace(close, '')
  }
  return source.replace(/\n$/, '')
}

function sanitizeHtmlBlock(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed
    .querySelectorAll('script, iframe, object, embed, form, base, link, meta')
    .forEach((node) => node.remove())
  parsed.body.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (
        name.startsWith('on') ||
        ['href', 'xlink:href', 'action', 'formaction', 'srcdoc'].includes(name)
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return parsed.body.innerHTML
}

const htmlFrameObservers = new WeakMap<HTMLIFrameElement, ResizeObserver>()

function buildDecorations(view: EditorView): DecorationSet {
  const collected: { from: number; to: number; deco: Decoration }[] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        const type = node.type.name

        if (type === 'InlineMath') {
          const content = node.node.getChild('MathContent')
          if (
            content &&
            !insideDisplayMath(view.state, node.from) &&
            !insideTable(view.state, node.from) &&
            !selectionOverlaps(view.state, node.from, node.to)
          ) {
            collected.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({
                widget: new InlineMathWidget(view.state.doc.sliceString(content.from, content.to))
              })
            })
          }
          return
        }

        if (HEADING_TYPES.has(type)) {
          const level = Number(type[type.length - 1])
          const mark = node.node.getChild('HeaderMark')
          if (!mark) return
          let contentFrom = mark.to
          if (view.state.doc.sliceString(contentFrom, contentFrom + 1) === ' ') contentFrom += 1
          const cls = `cm-md-h${level}`
          if (contentFrom < node.to) {
            collected.push({
              from: contentFrom,
              to: node.to,
              deco: Decoration.mark({ class: cls })
            })
          }
          const hasContent = contentFrom < node.to
          if (selectionOverlaps(view.state, node.from, node.to)) {
            // Marker stays visible while editing this line (cursor is on
            // it) — size it the same as the content, so "#"/"##"/etc.
            // plus whatever's typed after it reads as one coherent
            // heading instead of a small marker next to big text. Also
            // covers a bare "# " with nothing typed yet — that used to
            // get no styling at all, which is what made it look like it
            // "wasn't a heading yet" until you typed the first character.
            collected.push({
              from: mark.from,
              to: contentFrom,
              deco: Decoration.mark({ class: cls })
            })
          } else if (hasContent) {
            collected.push({ from: mark.from, to: contentFrom, deco: HIDE })
          }
          // else: an empty heading ("#"/"# " with nothing after it) that
          // isn't being edited — leave the marker as plain, small,
          // visible text rather than collapsing the only thing on the
          // line to nothing, which just looked like a blank empty line.
          return
        }

        if (type === 'StrongEmphasis' || type === 'Emphasis' || type === 'Strikethrough') {
          const markName = type === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark'
          const marks = node.node.getChildren(markName)
          if (marks.length !== 2) return
          const [open, close] = marks
          if (open.to >= close.from) return
          const cls =
            type === 'StrongEmphasis'
              ? 'cm-md-strong'
              : type === 'Emphasis'
                ? 'cm-md-em'
                : 'cm-md-strike'
          collected.push({ from: open.to, to: close.from, deco: Decoration.mark({ class: cls }) })
          if (!selectionOverlaps(view.state, node.from, node.to)) {
            collected.push({ from: open.from, to: open.to, deco: HIDE })
            collected.push({ from: close.from, to: close.to, deco: HIDE })
          }
          return
        }

        if (type === 'InlineCode') {
          const marks = node.node.getChildren('CodeMark')
          if (marks.length !== 2) return
          const [open, close] = marks
          if (open.to >= close.from) return
          collected.push({
            from: open.to,
            to: close.from,
            deco: Decoration.mark({ class: 'cm-md-code' })
          })
          if (!selectionOverlaps(view.state, node.from, node.to)) {
            collected.push({ from: open.from, to: open.to, deco: HIDE })
            collected.push({ from: close.from, to: close.to, deco: HIDE })
          }
          return
        }

        if (type === 'Link') {
          // Structure: [ LinkMark "[" ] LinkText [ LinkMark "]" ]
          //            [ LinkMark "(" ] URL      [ LinkMark ")" ]
          const marks = node.node.getChildren('LinkMark')
          const url = node.node.getChild('URL')
          if (marks.length < 2) return
          const openBracket = marks[0]
          const closeBracket = marks[1]
          if (openBracket.to >= closeBracket.from) return
          const linkClass = selectionOverlaps(view.state, node.from, node.to)
            ? 'cm-md-link cm-md-link-active'
            : 'cm-md-link'
          collected.push({
            from: openBracket.to,
            to: closeBracket.from,
            deco: Decoration.mark({ class: linkClass })
          })
          if (!selectionOverlaps(view.state, node.from, node.to)) {
            collected.push({ from: openBracket.from, to: openBracket.to, deco: HIDE })
            const hideFrom = closeBracket.from
            const hideTo = url ? url.to + 1 : closeBracket.to
            collected.push({ from: hideFrom, to: Math.min(hideTo, node.to), deco: HIDE })
          }
          return
        }

        if (type === 'TaskMarker') {
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
          const line = view.state.doc.lineAt(node.from)
          if (selectionOverlaps(view.state, line.from, node.to)) return
          const checked = view.state.doc.sliceString(node.from, node.to).toLowerCase() === '[x]'
          collected.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new CheckboxWidget(node.from, checked) })
          })
          return
        }

        if (type === 'HorizontalRule') {
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
              deco: Decoration.mark({ class: 'cm-md-hr' })
            })
          }
          return
        }

        if (type === 'Blockquote') {
          for (const mark of node.node.getChildren('QuoteMark')) {
            const line = view.state.doc.lineAt(mark.from)
            if (selectionOverlaps(view.state, line.from, line.to)) continue
            let hideTo = mark.to
            if (view.state.doc.sliceString(hideTo, hideTo + 1) === ' ') hideTo += 1
            collected.push({ from: mark.from, to: hideTo, deco: HIDE })
          }
          const callout = calloutMarkerRange(view, node)
          if (callout) {
            const line = view.state.doc.lineAt(callout.from)
            if (!selectionOverlaps(view.state, line.from, line.to)) {
              collected.push({
                from: callout.from,
                to: callout.to,
                deco: Decoration.replace({ widget: new CalloutLabelWidget(callout.type) })
              })
            }
          }
          return
        }

        if (type === 'FencedCode') {
          const marks = node.node.getChildren('CodeMark')
          if (marks.length < 2) return
          const openMark = marks[0]
          const closeMark = marks[marks.length - 1]
          if (selectionOverlaps(view.state, node.from, node.to)) return
          const languageNode = node.node.getChild('CodeInfo')
          const language = languageNode
            ? view.state.doc.sliceString(languageNode.from, languageNode.to).trim()
            : ''
          const isMermaid = language.toLowerCase() === 'mermaid'
          if (!isMermaid && closeMark.from > openMark.to) {
            const closeLineStart = view.state.doc.lineAt(closeMark.from).from
            collected.push({ from: closeLineStart, to: closeMark.to, deco: HIDE })
          }
          return
        }

        if (type === 'WikiLink') {
          // `[[Target]]` or `[[Target|Alias]]` (custom node from
          // markdownWikilink.ts — no built-in lezer support for this).
          const full = view.state.doc.sliceString(node.from, node.to)
          const pipeIdx = full.indexOf('|')
          const innerFrom = node.from + 2
          const innerTo = node.to - 2
          const displayFrom = pipeIdx >= 0 ? node.from + pipeIdx + 1 : innerFrom
          if (displayFrom >= innerTo) return
          collected.push({
            from: displayFrom,
            to: innerTo,
            deco: Decoration.mark({
              class: selectionOverlaps(view.state, node.from, node.to)
                ? 'cm-md-link cm-md-wikilink cm-md-link-active'
                : 'cm-md-link cm-md-wikilink'
            })
          })
          if (!selectionOverlaps(view.state, node.from, node.to)) {
            collected.push({ from: node.from, to: displayFrom, deco: HIDE })
            collected.push({ from: innerTo, to: node.to, deco: HIDE })
          }
          return
        }

        if (type === 'Image') {
          // Structure mirrors Link: [ LinkMark "![" ] alt [ LinkMark "]" ]
          // [ LinkMark "(" ] URL [ LinkMark ")" ]. Remote http(s) URLs
          // load directly; a local relative path resolves against the
          // active tab's root_path (via markdownRootPath) and goes
          // through Tauri's asset protocol.
          const url = node.node.getChild('URL')
          if (!url) return
          const rawUrl = view.state.doc.sliceString(url.from, url.to)
          if (selectionOverlaps(view.state, node.from, node.to)) return
          const rootPath = view.state.facet(markdownRootPath)
          const resolver = view.state.facet(markdownImageResolver)
          const documentPath = view.state.facet(markdownDocumentPath)
          if (!resolver && !resolveImageSrc(rootPath, rawUrl, documentPath)) return
          collected.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({
              widget: new ImageWidget(rawUrl, resolver, rootPath, documentPath)
            })
          })
          return
        }

        // Table is handled separately (see buildTableDecorations below) —
        // its widget is a `block: true` replace decoration, and CodeMirror
        // requires those to come from a StateField, not a ViewPlugin
        // (throws "Block decorations may not be specified via plugins" at
        // render time otherwise — reproduced live via a user-reported
        // crash, not hypothetical).
        if (type === 'Table') return false

        if (type === 'ListItem') {
          const parentType = node.node.parent?.type.name
          if (parentType === 'OrderedList') {
            // Left as literal visible text (never hidden/replaced,
            // unlike the bullet) — only styled for consistent spacing
            // against the bullet/checkbox markers, matching the
            // requested "unify the marker spacing, not the glyphs"
            // exactly: the digits/period themselves aren't touched.
            const mark = node.node.getChild('ListMark')
            if (mark) {
              collected.push({
                from: mark.from,
                to: mark.to,
                deco: Decoration.mark({ class: 'cm-md-list-number' })
              })
            }
            return
          }
          if (parentType !== 'BulletList') return
          // Task list items ("- [ ] ...") are still BulletList/ListItem
          // structurally (their content is a "Task" node in place of the
          // usual Paragraph) — rendering the "-" as a bullet on top of
          // the checkbox produced a bullet-then-checkbox double marker
          // that doesn't match Obsidian (no bullet for task items). The
          // dash still needs to actually *hide* here, not just skip the
          // bullet widget — leaving it unhandled left the literal "-"
          // visible as plain text in front of the checkbox.
          const taskNode = node.node.getChild('Task')
          if (taskNode) {
            const taskMark = node.node.getChild('ListMark')
            if (!taskMark) return
            const taskLine = view.state.doc.lineAt(taskMark.from)
            // Same threshold as the checkbox widget itself (through the
            // end of the "[ ]"/"[x]" marker, not the whole line) — this
            // dash is the other half of that same raw/preview toggle, and
            // gating it on "cursor anywhere on the line" let it stay
            // visible (as a bare "-", not hidden into the checkbox) while
            // the checkbox had already switched back to its widget, i.e.
            // the reported "bullet next to the checkbox" on the current
            // line.
            const checkboxMarker = taskNode.getChild('TaskMarker')
            const rawUntil = checkboxMarker ? checkboxMarker.to : taskLine.to
            if (!selectionOverlaps(view.state, taskLine.from, rawUntil)) {
              collected.push({ from: taskMark.from, to: taskMark.to, deco: HIDE })
            }
            return
          }
          const mark = node.node.getChild('ListMark')
          if (!mark) return
          const line = view.state.doc.lineAt(mark.from)
          // Gated through the marker's own end, not the whole line — same
          // threshold as TaskMarker/CheckboxWidget above (cursor has to be
          // on/near the "-" itself, not just anywhere in that item's text)
          // rather than raw mode covering the entire line's content.
          if (selectionOverlaps(view.state, line.from, mark.to)) {
            // Raw "-" still needs the bullet widget's own width so the
            // line's content doesn't visibly shift when toggling between
            // raw and preview — a bare unstyled "-" is much narrower than
            // the 1.4em bullet glyph box it replaces.
            collected.push({
              from: mark.from,
              to: mark.to,
              deco: Decoration.mark({ class: 'cm-md-bullet-raw' })
            })
            return
          }
          collected.push({
            from: mark.from,
            to: mark.to,
            deco: Decoration.replace({ widget: new BulletWidget() })
          })
          return
        }
        // No branch above matched this node type — nothing to decorate.
        // Explicit (not just falling off the end) because the "Table"
        // branch's `return false` makes TS infer a `boolean | void`
        // return type for this callback, and this build's tsconfig (the
        // Electron app's, stricter than ui/'s) turns on noImplicitReturns.
        return
      }
    })
  }

  collected.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to, deco } of collected) {
    const isWidget = (deco.spec as { widget?: unknown }).widget !== undefined
    if (from >= to && !isWidget) continue
    builder.add(from, to, deco)
  }
  return builder.finish()
}

const inlineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.transactions.some((transaction) => transaction.reconfigured)
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations
  }
)

// Block-level styling (blockquote left border/indent, fenced-code-block
// background) applies per line rather than as an inline mark/replace
// range, so it lives in its own decoration set built the same way
// CodeMirror's own active-line highlighting does — kept separate from
// `inlineDecorations` above rather than merged into one RangeSetBuilder.
function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const lineClasses = new Map<number, string>()

  const addClass = (lineFrom: number, cls: string) => {
    lineClasses.set(
      lineFrom,
      lineClasses.has(lineFrom) ? `${lineClasses.get(lineFrom)} ${cls}` : cls
    )
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        const type = node.type.name

        if (type !== 'Blockquote' && type !== 'FencedCode') return
        let cls = type === 'Blockquote' ? 'cm-md-quote-line' : 'cm-md-codeblock-line'
        if (type === 'Blockquote') {
          const callout = calloutMarkerRange(view, node)
          if (callout) cls += ` cm-md-callout-line cm-md-callout-${callout.type}-line`
        }
        const startLine = view.state.doc.lineAt(node.from).number
        const endLine = view.state.doc.lineAt(Math.max(node.from, node.to - 1)).number
        for (let ln = startLine; ln <= endLine; ln++) {
          const position = view.state.doc.line(ln).from
          const edge =
            type === 'FencedCode'
              ? `${ln === startLine ? ' cm-md-codeblock-start' : ''}${ln === endLine ? ' cm-md-codeblock-end' : ''}`
              : ''
          addClass(position, `${cls}${edge}`)
        }
      }
    })
  }

  const sortedLineFroms = [...lineClasses.keys()].sort((a, b) => a - b)
  for (const lineFrom of sortedLineFroms) {
    builder.add(lineFrom, lineFrom, Decoration.line({ class: lineClasses.get(lineFrom)! }))
  }
  return builder.finish()
}

const blockDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations
  }
)

function buildCodeBlockHeaderDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const decorations: Array<{ from: number; to: number; decoration: Decoration }> = []
  syntaxTree(state).iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.type.name !== 'FencedCode' || selectionOverlaps(state, node.from, node.to)) return
      const marks = node.node.getChildren('CodeMark')
      if (marks.length < 2) return
      const languageNode = node.node.getChild('CodeInfo')
      const language = languageNode
        ? (state.doc.sliceString(languageNode.from, languageNode.to).trim().split(/\s+/, 1)[0] ??
          '')
        : ''
      if (language.toLowerCase() === 'mermaid') return
      const openingLine = state.doc.lineAt(marks[0].from)
      const closingLine = state.doc.lineAt(marks[marks.length - 1].from)
      const source = state.doc.sliceString(
        Math.min(openingLine.to + 1, closingLine.from),
        closingLine.from
      )
      decorations.push({
        from: openingLine.from,
        to: openingLine.to,
        decoration: Decoration.replace({
          widget: new CodeBlockHeaderWidget(language, source),
          block: true
        })
      })
    }
  })
  decorations.sort((a, b) => a.from - b.from || a.to - b.to)
  for (const item of decorations) builder.add(item.from, item.to, item.decoration)
  return builder.finish()
}

const codeBlockHeaderDecorations = StateField.define<DecorationSet>({
  create: buildCodeBlockHeaderDecorations,
  update: (decorations, transaction) =>
    transaction.docChanged || transaction.selection
      ? buildCodeBlockHeaderDecorations(transaction.state)
      : decorations.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field)
})

// Tables render as a `block: true` replace decoration (see TableWidget),
// which CodeMirror only allows from a StateField — hence this being a
// separate extension from inlineDecorations/blockDecorations above (both
// ViewPlugins). Recomputed over the whole document rather than just
// view.visibleRanges since a StateField's update() only gets the
// transaction, not the view's current viewport.
function buildTableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  syntaxTree(state).iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.type.name !== 'Table') return
      if (selectionOverlaps(state, node.from, node.to)) return
      const startLine = state.doc.lineAt(node.from)
      const endLine = state.doc.lineAt(node.to)
      // See TableWidget's comment: block decorations must span exact line
      // boundaries, so this is checked rather than assumed.
      if (startLine.from !== node.from || endLine.to !== node.to) return
      const header = node.node.getChild('TableHeader')
      if (!header) return
      const headerSource = state.doc.sliceString(header.from, header.to)
      const headerParts = splitMarkdownTableRowDetailed(headerSource, header.from)
      const headerCells = headerParts.map((cell) => cell.text)
      const delimiter = node.node
        .getChildren('TableDelimiter')
        .find((candidate) => candidate.from > header.to)
      const delimiterText = delimiter ? state.doc.sliceString(delimiter.from, delimiter.to) : ''
      const delimiterCells = splitMarkdownTableRow(delimiterText)
      const alignments = headerCells.map((_, index) => {
        const rule = delimiterCells[index]?.trim() ?? ''
        return rule.startsWith(':') && rule.endsWith(':')
          ? 'center'
          : rule.endsWith(':')
            ? 'right'
            : 'left'
      })
      const bodyParts = node.node
        .getChildren('TableRow')
        .map((row) =>
          splitMarkdownTableRowDetailed(state.doc.sliceString(row.from, row.to), row.from)
        )
      const bodyRows = bodyParts.map((row) => row.map((cell) => cell.text))
      const columnCount = Math.max(headerCells.length, ...bodyRows.map((row) => row.length))
      const headerRanges = headerParts.map(({ from, to }) => ({ from, to }))
      const rowRanges = bodyParts.map((row) => row.map(({ from, to }) => ({ from, to })))
      builder.add(
        node.from,
        node.to,
        Decoration.replace({
          widget: new TableWidget(
            headerCells,
            bodyRows,
            alignments,
            readTableWidths(state, node.to, columnCount),
            node.from,
            node.to,
            headerRanges,
            rowRanges
          ),
          block: true
        })
      )
    }
  })
  return builder.finish()
}

const tableDecorations = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update: (deco, tr) =>
    tr.docChanged || tr.selection ? buildTableDecorations(tr.state) : deco.map(tr.changes),
  provide: (field) => EditorView.decorations.from(field)
})

function buildDisplayMathDecorations(state: EditorState): DecorationSet {
  const fencedRanges: Array<{ from: number; to: number }> = []
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.type.name === 'FencedCode') fencedRanges.push({ from: node.from, to: node.to })
    }
  })
  const inFence = (from: number, to: number) =>
    fencedRanges.some((range) => from < range.to && to > range.from)
  const builder = new RangeSetBuilder<Decoration>()
  let lineNumber = 1
  while (lineNumber <= state.doc.lines) {
    const line = state.doc.line(lineNumber)
    if (inFence(line.from, line.to)) {
      lineNumber++
      continue
    }
    const single = line.text.match(/^\s*\$\$(.+)\$\$\s*$|^\s*\\\[(.+)\\\]\s*$/)
    if (single) {
      const source = single[1] ?? single[2] ?? ''
      if (!selectionOverlaps(state, line.from, line.to)) {
        builder.add(
          line.from,
          line.to,
          Decoration.replace({ widget: new InlineMathWidget(source, true), block: true })
        )
      }
      lineNumber++
      continue
    }
    const open = line.text.match(/^\s*(\$\$|\\\[)\s*$/)
    if (!open) {
      lineNumber++
      continue
    }
    const closeText = open[1] === '$$' ? '$$' : '\\]'
    let closeLineNumber = lineNumber + 1
    while (closeLineNumber <= state.doc.lines) {
      const candidate = state.doc.line(closeLineNumber)
      if (inFence(candidate.from, candidate.to)) break
      if (candidate.text.trim() === closeText) break
      closeLineNumber++
    }
    if (
      closeLineNumber > state.doc.lines ||
      state.doc.line(closeLineNumber).text.trim() !== closeText
    ) {
      lineNumber++
      continue
    }
    const closeLine = state.doc.line(closeLineNumber)
    const source = state.doc.sliceString(line.to + 1, closeLine.from)
    if (!selectionOverlaps(state, line.from, closeLine.to)) {
      builder.add(
        line.from,
        closeLine.to,
        Decoration.replace({ widget: new InlineMathWidget(source, true), block: true })
      )
    }
    lineNumber = closeLineNumber + 1
  }
  return builder.finish()
}

function buildMermaidDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  syntaxTree(state).iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.type.name !== 'FencedCode' || selectionOverlaps(state, node.from, node.to)) return
      const source = mermaidSource(state, node)
      if (source === null) return
      const firstLine = state.doc.lineAt(node.from)
      const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1))
      if (firstLine.from !== node.from || lastLine.to !== node.to) return
      builder.add(
        node.from,
        node.to,
        Decoration.replace({ widget: new MermaidWidget(source, node.from, node.to), block: true })
      )
    }
  })
  return builder.finish()
}

const mermaidDecorations = StateField.define<DecorationSet>({
  create: buildMermaidDecorations,
  update: (decorations, transaction) =>
    transaction.docChanged || transaction.selection
      ? buildMermaidDecorations(transaction.state)
      : decorations.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field)
})

const displayMathDecorations = StateField.define<DecorationSet>({
  create: buildDisplayMathDecorations,
  update: (decorations, transaction) =>
    transaction.docChanged || transaction.selection
      ? buildDisplayMathDecorations(transaction.state)
      : decorations.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field)
})

function buildHtmlBlockDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  syntaxTree(state).iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.type.name !== 'HTMLBlock' || selectionOverlaps(state, node.from, node.to)) return
      const firstLine = state.doc.lineAt(node.from)
      const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1))
      if (firstLine.from !== node.from) return
      const source = state.doc.sliceString(node.from, lastLine.to)
      if (/^\s*<!-- workspace-table-widths: [\d., ]+ -->\s*$/.test(source)) {
        builder.add(node.from, lastLine.to, Decoration.replace({ block: true }))
        return
      }
      builder.add(
        node.from,
        lastLine.to,
        Decoration.replace({ widget: new HtmlBlockWidget(source), block: true })
      )
    }
  })
  return builder.finish()
}

const htmlBlockDecorations = StateField.define<DecorationSet>({
  create: (state) => buildHtmlBlockDecorations(state),
  update: (decorations, transaction) =>
    transaction.docChanged || transaction.selection
      ? buildHtmlBlockDecorations(transaction.state)
      : decorations.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field)
})

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
export const markdownLivePreview: Extension[] = [
  frontmatterDecorations,
  inlineDecorations,
  blockDecorations,
  codeBlockHeaderDecorations,
  tableDecorations,
  mermaidDecorations,
  displayMathDecorations,
  htmlBlockDecorations
]
