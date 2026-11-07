import { ipcMain, webContents, BrowserWindow } from 'electron'

function webContentsFromId(webContentsId: number) {
  return webContents.fromId(webContentsId) ?? null
}

export function registerBrowserNavIpc(): void {
  ipcMain.handle('browser:get-nav-history', (_event, webContentsId: number) => {
    const wc = webContentsFromId(webContentsId)
    if (!wc) return null
    const history = wc.navigationHistory
    return {
      entries: history.getAllEntries().map((e) => ({ url: e.url, title: e.title || e.url })),
      activeIndex: history.getActiveIndex()
    }
  })

  ipcMain.handle('browser:go-back', (_event, webContentsId: number) => {
    const wc = webContentsFromId(webContentsId)
    if (!wc) return false
    wc.navigationHistory.goBack()
    return true
  })

  ipcMain.handle('browser:go-forward', (_event, webContentsId: number) => {
    const wc = webContentsFromId(webContentsId)
    if (!wc) return false
    wc.navigationHistory.goForward()
    return true
  })

  ipcMain.handle('browser:go-to-index', (_event, webContentsId: number, index: number) => {
    const wc = webContentsFromId(webContentsId)
    if (!wc) return false
    wc.navigationHistory.goToIndex(index)
    return true
  })

  ipcMain.handle('browser:focus-guest', (event, webContentsId: number) => {
    const wc = webContentsFromId(webContentsId)
    if (!wc || wc.isDestroyed()) return false
    const hostWin = BrowserWindow.fromWebContents(event.sender)
    hostWin?.focus()
    // Do NOT event.sender.focus() — that re-focuses the renderer shell and
    // pulls keyboard focus off the guest we are about to focus.
    wc.focus()
    return true
  })

  ipcMain.handle('browser:blur-guest', (event, webContentsId: number) => {
    const wc = webContentsFromId(webContentsId)
    if (!wc || wc.isDestroyed()) return false
    // Return keyboard to the Workspace renderer so terminal xterm can type.
    event.sender.focus()
    return true
  })
}
