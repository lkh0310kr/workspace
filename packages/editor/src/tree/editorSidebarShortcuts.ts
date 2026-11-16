type KeyboardShortcutInput = Pick<
  KeyboardEvent,
  'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'key' | 'code'
>

/** Match the Editor tree toggle by its physical key as well as its layout value. */
export function isEditorSidebarToggleShortcut(event: KeyboardShortcutInput): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    (event.key === '\\' || event.code === 'Backslash')
  )
}
