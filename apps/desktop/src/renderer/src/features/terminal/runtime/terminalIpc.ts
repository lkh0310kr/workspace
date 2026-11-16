/** Desktop IPC adapter for Terminal process and input shortcut capabilities. */
export async function ptyResize(id: number, cols: number, rows: number): Promise<void> {
  return window.api.pty.resize(id, cols, rows)
}

export async function spawnTerminal(cols = 120, rows = 40, tabId?: number): Promise<number> {
  return window.api.pty.spawn(cols, rows, tabId)
}

/** Cmd/Ctrl+V relay from Main while a Terminal pane owns focus. */
export function onTerminalPasteShortcut(
  handler: (payload: { terminalId: number }) => void
): () => void {
  return window.api.shortcuts.onTerminalPaste(handler)
}
