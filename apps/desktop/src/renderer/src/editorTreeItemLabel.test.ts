import { describe, expect, it } from 'vitest'
import { editorTreeItemLabel } from '@workspace/editor'

describe('editorTreeItemLabel', () => {
  it('hides Markdown suffixes when the tree requests compact labels', () => {
    expect(editorTreeItemLabel('note.md', 'markdown')).toBe('note')
    expect(editorTreeItemLabel('note.markdown', 'markdown')).toBe('note')
  })

  it('keeps the Markdown suffix in Workspace tree labels when requested', () => {
    expect(editorTreeItemLabel('note.md', 'markdown', { showMarkdownExtension: true })).toBe(
      'note.md'
    )
    expect(
      editorTreeItemLabel('note.markdown', 'markdown', { showMarkdownExtension: true })
    ).toBe('note.markdown')
  })
})
