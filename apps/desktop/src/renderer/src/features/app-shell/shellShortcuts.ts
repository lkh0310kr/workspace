/** Cmd/Ctrl+` returns to Home, including while an embedded browser has focus. */
export function onHomeShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onHome(handler)
}

/** Cmd+W closes the active pane tab instead of the whole window. */
export function onClosePaneTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onClosePaneTab(handler)
}
