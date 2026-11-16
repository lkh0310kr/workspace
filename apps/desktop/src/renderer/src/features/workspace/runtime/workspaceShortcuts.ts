/** Workspace shortcuts relayed by the Electron main process. */
export function onShortcutModifierReleased(handler: () => void): () => void {
  return window.api.shortcuts.onShortcutModifierReleased(handler)
}

export function onShortcutModifierPressed(handler: () => void): () => void {
  return window.api.shortcuts.onShortcutModifierPressed(handler)
}

/** Cmd/Ctrl+1..9: the main process relays this while a Terminal owns focus. */
export function onSwitchWorkspaceTabIndexShortcut(
  handler: (payload: { index: number }) => void
): () => void {
  return window.api.shortcuts.onSwitchWorkspaceTabIndex(handler)
}
