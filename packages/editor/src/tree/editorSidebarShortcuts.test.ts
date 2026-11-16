import { describe, expect, it } from 'vitest'
import { isEditorSidebarToggleShortcut } from './editorSidebarShortcuts'

describe('isEditorSidebarToggleShortcut', () => {
  it('matches the physical backslash key when a keyboard layout reports a different character', () => {
    expect(
      isEditorSidebarToggleShortcut({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        key: '₩',
        code: 'Backslash'
      })
    ).toBe(true)
  })

  it('matches the logical key when a platform does not provide a physical code', () => {
    expect(
      isEditorSidebarToggleShortcut({
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        key: '\\',
        code: ''
      })
    ).toBe(true)
  })

  it('does not consume shifted or alternate shortcuts', () => {
    for (const modifiers of [
      { shiftKey: true, altKey: false },
      { shiftKey: false, altKey: true }
    ]) {
      expect(
        isEditorSidebarToggleShortcut({
          metaKey: true,
          ctrlKey: false,
          ...modifiers,
          key: '|',
          code: 'Backslash'
        })
      ).toBe(false)
    }
  })
})
