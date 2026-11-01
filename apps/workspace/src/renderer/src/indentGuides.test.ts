/** @vitest-environment jsdom */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { detectIndentation, indentGuideColumns, indentGuides } from './indentGuides'

describe('indent guides', () => {
  it('detects two and four space project indentation from document lines', () => {
    expect(detectIndentation(['root', '  child', '    nested', '      deeper'], 4, true)).toEqual({
      indentSize: 2,
      insertSpaces: true
    })
    expect(
      detectIndentation(['root', '    child', '        nested', '            deeper'], 2, true)
    ).toEqual({ indentSize: 4, insertSpaces: true })
  })

  it('places guides at the start of each nested indent level, not at text start', () => {
    expect(indentGuideColumns(2, 4)).toEqual([0])
    expect(indentGuideColumns(4, 4)).toEqual([0])
    expect(indentGuideColumns(8, 4)).toEqual([0, 4])
    expect(indentGuideColumns(12, 4)).toEqual([0, 4, 8])
    expect(indentGuideColumns(6, 2)).toEqual([0, 2, 4])
  })

  it('uses tab stops for tab indented files', () => {
    expect(detectIndentation(['root', '\tchild', '\t\tnested'], 4, true)).toEqual({
      indentSize: 4,
      insertSpaces: false
    })
    expect(indentGuideColumns(8, 4)).toEqual([0, 4])
  })

  it('renders guide line decorations for two-space files before geometry is measurable', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'root\n  child\n    nested\n      deeper',
        extensions: indentGuides
      })
    })

    try {
      const lines = Array.from(parent.querySelectorAll<HTMLElement>('.cm-indent-guide-line'))
      expect(lines.map((line) => line.textContent)).toEqual([
        '  child',
        '    nested',
        '      deeper'
      ])
      expect(lines.every((line) => line.style.backgroundImage.length > 0)).toBe(true)
      expect(lines[0].style.backgroundPosition).toContain('ch')
    } finally {
      view.destroy()
      parent.remove()
    }
  })
})
