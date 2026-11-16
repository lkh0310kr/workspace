import { ipcMain } from 'electron'
import type { Workspace } from '../workspace'
import type { SearchOptions } from '../search'

/** Register streamed workspace file-search events and their cancellation lifecycle. */
export function registerWorkspaceSearchIpc(getWorkspace: () => Workspace): void {
  const activeSearches = new Map<string, { cancel: () => void }>()

  ipcMain.on(
    'fs:search-in-files',
    (
      event,
      requestId: string,
      tabId: number,
      query: string,
      options: SearchOptions,
      expectedRootPath?: string
    ) => {
      activeSearches.get(requestId)?.cancel()
      try {
        const workspace = getWorkspace()
        if (expectedRootPath !== undefined) workspace.assertTabRoot(tabId, expectedRootPath)
        const handle = workspace.searchInFiles(
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
}
