import { ipcMain } from 'electron'
import type { Workspace } from '../workspace'
import type { SearchOptions } from '../search'
import { resolveUserSelectedRootPath } from '../wslPaths'
import { saveConfig } from '../persistence'

/** Register tab, filesystem, search, and workspace-scoped media IPC handlers. */
export function registerWorkspaceIpc(getWorkspace: () => Workspace, persist: () => void): void {
  ipcMain.handle('workspace:get-state', () => getWorkspace().state())
  ipcMain.handle('workspace:add-tab', () => {
    const id = getWorkspace().addTab()
    persist()
    return id
  })
  ipcMain.handle('workspace:close-tab', (_event, tabId: number) => {
    getWorkspace().closeTab(tabId)
    persist()
  })
  ipcMain.handle('workspace:select-tab', (_event, tabId: number) => {
    getWorkspace().selectTab(tabId)
    persist()
  })
  ipcMain.handle('workspace:rename-tab', (_event, tabId: number, title: string) => {
    getWorkspace().renameTab(tabId, title)
    persist()
  })
  ipcMain.handle('workspace:reorder-tabs', (_event, orderedIds: number[]) => {
    getWorkspace().reorderTabs(orderedIds)
    persist()
  })
  ipcMain.handle('workspace:set-tab-layout', (_event, tabId: number, layoutJson: string) => {
    getWorkspace().setTabLayout(tabId, layoutJson)
    persist()
  })
  ipcMain.handle('workspace:set-tab-root-path', (_event, tabId: number, rootPath: string) => {
    const workspace = getWorkspace()
    const nativeRoot = resolveUserSelectedRootPath(rootPath)
    workspace.setTabRootPath(tabId, nativeRoot)
    if (tabId === workspace.state().activeTabId) {
      workspace.defaultRootPath = nativeRoot
      saveConfig({ rootPath: nativeRoot })
    }
    persist()
    return workspace.state()
  })

  ipcMain.handle('fs:list-dir', (_event, tabId: number, rel: string) =>
    getWorkspace().listDir(tabId, rel)
  )
  ipcMain.handle('fs:read-file', (_event, tabId: number, rel: string) =>
    getWorkspace().readFile(tabId, rel)
  )
  ipcMain.handle('fs:read-file-binary-preview', (_event, tabId: number, rel: string) =>
    getWorkspace().readFileBinaryPreview(tabId, rel)
  )
  ipcMain.handle('fs:write-file', (_event, tabId: number, rel: string, content: string) =>
    getWorkspace().writeFile(tabId, rel, content)
  )
  ipcMain.handle(
    'fs:write-file-if-unchanged',
    (_event, tabId: number, rel: string, expected: string, content: string) =>
      getWorkspace().writeFileIfUnchanged(tabId, rel, expected, content)
  )
  ipcMain.handle('fs:create-dir', (_event, tabId: number, rel: string) =>
    getWorkspace().createDir(tabId, rel)
  )
  ipcMain.handle('fs:delete-path', (_event, tabId: number, rel: string) =>
    getWorkspace().deletePath(tabId, rel)
  )
  ipcMain.handle('fs:rename-path', (_event, tabId: number, fromRel: string, toRel: string) =>
    getWorkspace().renamePath(tabId, fromRel, toRel)
  )

  // Search streams multiple results and supports cancellation, so it uses
  // event channels instead of a one-shot ipcMain.handle request.
  const activeSearches = new Map<string, { cancel: () => void }>()
  ipcMain.on(
    'fs:search-in-files',
    (event, requestId: string, tabId: number, query: string, options: SearchOptions) => {
      activeSearches.get(requestId)?.cancel()
      try {
        const handle = getWorkspace().searchInFiles(
          tabId,
          query,
          options,
          (result) => {
            if (!event.sender.isDestroyed())
              event.sender.send('fs:search-result', requestId, result)
          },
          (error) => {
            activeSearches.delete(requestId)
            if (!event.sender.isDestroyed()) event.sender.send('fs:search-done', requestId, error)
          }
        )
        activeSearches.set(requestId, handle)
      } catch (error) {
        activeSearches.delete(requestId)
        const message = error instanceof Error ? error.message : String(error)
        if (!event.sender.isDestroyed()) event.sender.send('fs:search-done', requestId, message)
      }
    }
  )
  ipcMain.on('fs:search-cancel', (_event, requestId: string) => {
    activeSearches.get(requestId)?.cancel()
    activeSearches.delete(requestId)
  })
  ipcMain.handle('fs:list-all-files', (_event, tabId: number) => getWorkspace().listAllFiles(tabId))
  ipcMain.handle('media:get-url', (_event, tabId: number, rel: string) =>
    getWorkspace().mediaUrl(tabId, rel)
  )
}
