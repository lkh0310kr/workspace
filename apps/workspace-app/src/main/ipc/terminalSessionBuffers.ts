import { ipcMain, type BrowserWindow } from 'electron'
import type { TerminalSessionBuffersFile } from '../../shared/terminal-session-buffers'
import type { Workspace } from '../workspace'

export function requestTerminalSessionBuffers(mainWindow: BrowserWindow | null, workspace: Workspace | null): Promise<TerminalSessionBuffersFile> {
  return new Promise((resolve) => {
    const webContents = mainWindow?.webContents
    if (!webContents || webContents.isDestroyed()) {
      resolve({ buffersByTerminalId: {} })
      return
    }
    const terminalIds = workspace?.allReferencedTerminalIds() ?? []
    const timer = setTimeout(() => resolve({ buffersByTerminalId: {} }), 5000)
    ipcMain.once('terminal:session-buffers', (_event, payload: TerminalSessionBuffersFile) => {
      clearTimeout(timer)
      resolve(payload?.buffersByTerminalId && typeof payload.buffersByTerminalId === 'object' ? payload : { buffersByTerminalId: {} })
    })
    webContents.send('terminal:capture-session-buffers', terminalIds)
  })
}
