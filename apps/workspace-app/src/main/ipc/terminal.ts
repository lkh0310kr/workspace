import { ipcMain } from 'electron'
import type { Workspace } from '../workspace'

/** Register the terminal and PTY IPC endpoints owned by the Workspace model. */
export function registerTerminalIpc(
  getWorkspace: () => Workspace,
  setFocusedTerminal: (id: number | null) => void,
): void {
  ipcMain.handle('pty:spawn', (_event, cols: number, rows: number, tabId?: number) =>
    getWorkspace().spawnTerminal(cols, rows, tabId),
  )
  ipcMain.handle('pty:connect', (event, id: number) => getWorkspace().connectTerminal(id, event.sender))
  ipcMain.on('pty:disconnect', (event, id: number) => getWorkspace().disconnectTerminal(id, event.sender))
  ipcMain.on('pty:write', (_event, id: number, data: Uint8Array) => {
    getWorkspace().terminalWrite(id, Buffer.from(data))
  })
  ipcMain.on('pty:ack-output', (_event, id: number, seq: number) => getWorkspace().acknowledgeTerminalOutput(id, seq))
  ipcMain.on('terminal:set-focused', (_event, id: number | null) => setFocusedTerminal(id))
  ipcMain.on('pty:resize', (_event, id: number, cols: number, rows: number) => getWorkspace().terminalResize(id, cols, rows))
  ipcMain.on('pty:dispose', () => {
    // Terminal processes are released when no tab layout references them.
  })
}
