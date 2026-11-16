/** Cmd/Ctrl+` returns to Home, including while an embedded browser has focus. */
export function onHomeShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onHome(handler)
}

/** Cmd+W closes the active pane tab instead of the whole window. */
export function onClosePaneTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onClosePaneTab(handler)
}

/** Main relays Cmd/Ctrl+, before the renderer can toggle the settings popover twice. */
export function onOpenSettingsShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onOpenSettings(handler)
}
