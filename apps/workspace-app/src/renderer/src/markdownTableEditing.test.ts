/** @vitest-environment jsdom */
import { EditorView } from '../../../../../node_modules/@codemirror/view'
import { EditorState } from '../../../../../node_modules/@codemirror/state'
import { syntaxTree } from '../../../../../node_modules/@codemirror/language'
import { describe, expect, it } from 'vitest'
import { createMarkdownEditorExtensions } from '../../../../../packages/editor/src/markdownEditor'

describe('Markdown table live preview editing', () => {
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
})
