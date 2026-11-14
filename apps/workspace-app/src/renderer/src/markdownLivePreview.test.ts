/** @vitest-environment jsdom */
import { EditorView } from '../../../../../node_modules/@codemirror/view'
import { EditorState } from '../../../../../node_modules/@codemirror/state'
import { syntaxTree } from '../../../../../node_modules/@codemirror/language'
import { describe, expect, it, vi } from 'vitest'
import { createMarkdownEditorExtensions } from '../../../../../packages/editor/src/markdownEditor'

describe('Markdown table live preview editing', () => {
  it('renders HTML line breaks inside Markdown table cells', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'Table test\n\n| Tasks | Value |\n| --- | --- |\n| * first<br>* second<br />third | ok |',
        extensions: createMarkdownEditorExtensions()
      })
    })

    try {
      const cell = parent.querySelector<HTMLElement>('.cm-md-table-wrap tbody td')!
      expect(cell.querySelectorAll('br')).toHaveLength(2)
      expect(cell.textContent).toBe('* first* secondthird')
      expect(cell.innerHTML).toBe('* first<br>* second<br>third')
    } finally {
      view.destroy()
      parent.remove()
    }
  })

  it('opens a clicked rendered cell for editing and writes the change back to Markdown', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'Table test\n\n| Name | Value |\n| --- | --- |\n| Alpha | 1 |',
        extensions: createMarkdownEditorExtensions()
      })
    })

    try {
      expect(syntaxTree(view.state).toString()).toContain('Table')
      const cell = parent.querySelector<HTMLElement>('.cm-md-table-wrap tbody td')
      expect(cell).not.toBeNull()
      cell!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(cell!.contentEditable).toBe('true')
      expect(cell!.getAttribute('role')).toBe('textbox')

      cell!.textContent = 'Updated'
      cell!.blur()

      expect(view.state.doc.toString()).toContain('| Updated | 1 |')
      expect(view.state.doc.toString()).toContain('| Name | Value |')
    } finally {
      view.destroy()
      parent.remove()
    }
  })

  it('moves through cells and exits the last cell with Tab after preserving the edit', async () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => []
    })
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'Table test\n\n| Name | Value |\n| --- | --- |\n| Alpha | 1 |',
        extensions: createMarkdownEditorExtensions()
      })
    })

    try {
      const firstCell = parent.querySelector<HTMLElement>('.cm-md-table-wrap tbody td')!
      firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      firstCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

      await vi.waitFor(() => {
        expect(
          parent.querySelector<HTMLElement>('.cm-md-table-wrap tbody td:nth-child(2)')
            ?.contentEditable
        ).toBe('true')
      })
      const lastCell = parent.querySelector<HTMLElement>(
        '.cm-md-table-wrap tbody tr:last-child td:last-child'
      )!
      lastCell.textContent = '2'
      lastCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

      await vi.waitFor(() => {
        expect(view.state.doc.toString()).toContain('| Alpha | 2 |')
        expect(view.state.doc.toString().endsWith('\n')).toBe(true)
        expect(view.state.selection.main.head).toBe(view.state.doc.length)
      })
    } finally {
      view.destroy()
      parent.remove()
    }
  })

  it('exits before the table when Shift-Tab leaves the first cell', async () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => []
    })
    const source = 'Table test\n\n| Name | Value |\n| --- | --- |\n| Alpha | 1 |'
    const tableFrom = source.indexOf('| Name')
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: source, extensions: createMarkdownEditorExtensions() })
    })

    try {
      const firstCell = parent.querySelector<HTMLElement>('.cm-md-table-wrap thead th')!
      firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      firstCell.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
      )

      await vi.waitFor(() => expect(view.state.selection.main.head).toBe(tableFrom - 1))
      expect(view.state.doc.toString()).toBe(source)
    } finally {
      view.destroy()
      parent.remove()
    }
  })
})

describe('Markdown Mermaid live preview', () => {
  it('renders a flowchart with Korean node labels as an SVG', async () => {
    const source = `graph LR
    subgraph 초보자 레벨
        M1[모듈 1: 기초 (튜닝, 음정)] --> M2[모듈 2: 오픈 코드]
        M2 --> M3[모듈 3: 스트러밍 & 리듬]
    end
    subgraph 중급 레벨
        M4[모듈 4: 바레 코드]
        M5[모듈 5: 스케일 & 솔로 기초]
        M6[모듈 6: 쉬운 곡 연주]
        M3 --> M4
        M4 --> M5
        M5 --> M6
    end
    subgraph 고급 레벨
        M7[모듈 7: 즉흥 연주 & 작곡]
        M8[모듈 8: 퍼포먼스 스킬]
        M6 --> M7
        M7 --> M8
    end`
    const parent = document.createElement('div')
    document.body.append(parent)
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 120, height: 24 })
    })
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value: () => 120
    })
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: `Diagram\n\n\`\`\`mermaid\n${source}\n\`\`\``,
        extensions: createMarkdownEditorExtensions()
      })
    })

    try {
      await vi.waitFor(() => {
        expect(parent.querySelector('.cm-md-mermaid svg, .cm-md-mermaid.is-error')).not.toBeNull()
      })
      expect(parent.querySelector('.cm-md-mermaid svg'), parent.textContent).not.toBeNull()
      expect(parent.querySelector('.cm-md-mermaid svg foreignObject')).toBeNull()
      expect(parent.querySelector('.cm-md-mermaid')?.classList.contains('is-error')).toBe(false)
      expect(view.state.doc.toString()).toContain(source)
    } finally {
      view.destroy()
      parent.remove()
    }
  })
})
