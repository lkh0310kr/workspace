/** Electron main-process shortcuts owned by the Editor feature. */
export function onQuickOpenShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onQuickOpen(handler)
}

/** Cmd+Shift+V — paste clipboard as plain text in the focused editor. */
export function onPastePlainTextShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onPastePlainText(handler)
}
