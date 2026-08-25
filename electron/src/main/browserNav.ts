import { ipcMain, webContents } from 'electron'

export function registerBrowserNavIpc(): void {
  ipcMain.handle('browser:get-nav-history', (_event, webContentsId: number) => {
    const wc = webContents.fromId(webContentsId)
    if (!wc) return null
    const history = wc.navigationHistory
    return {
      entries: history.getAllEntries().map((e) => ({ url: e.url, title: e.title || e.url })),
      activeIndex: history.getActiveIndex()
    }
  })
}
