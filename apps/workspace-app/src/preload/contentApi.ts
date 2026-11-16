import { ipcRenderer } from 'electron'
import type { WorkspaceApi } from './index.d'

export const contentApi: Pick<
  WorkspaceApi,
  'workspace' | 'fs' | 'media' | 'model3d' | 'cad' | 'epub'
> = {
  workspace: {
    getState: () => ipcRenderer.invoke('workspace:get-state'),
    addTab: (): Promise<number> => ipcRenderer.invoke('workspace:add-tab'),
    closeTab: (tabId: number): Promise<void> => ipcRenderer.invoke('workspace:close-tab', tabId),
    selectTab: (tabId: number): Promise<void> => ipcRenderer.invoke('workspace:select-tab', tabId),
    renameTab: (tabId: number, title: string): Promise<void> =>
      ipcRenderer.invoke('workspace:rename-tab', tabId, title),
    reorderTabs: (orderedIds: number[]): Promise<void> =>
      ipcRenderer.invoke('workspace:reorder-tabs', orderedIds),
    setTabLayout: (tabId: number, layoutJson: string): Promise<void> =>
      ipcRenderer.invoke('workspace:set-tab-layout', tabId, layoutJson),
    setTabRootPath: (tabId: number, rootPath: string) =>
      ipcRenderer.invoke('workspace:set-tab-root-path', tabId, rootPath),
    onUpdated: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]): void =>
        cb(state)
      ipcRenderer.on('workspace:updated', listener)
      return () => ipcRenderer.removeListener('workspace:updated', listener)
    }
  },
  fs: {
    listDir: (tabId: number, rel: string) => ipcRenderer.invoke('fs:list-dir', tabId, rel),
    readFile: (tabId: number, rel: string): Promise<string> =>
      ipcRenderer.invoke('fs:read-file', tabId, rel),
    readFileBinaryPreview: (
      tabId: number,
      rel: string
    ): Promise<{ content: string; mimeType: string } | null> =>
      ipcRenderer.invoke('fs:read-file-binary-preview', tabId, rel),
    writeFile: (tabId: number, rel: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:write-file', tabId, rel, content),
    writeFileIfUnchanged: (
      tabId: number,
      rel: string,
      expected: string,
      content: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('fs:write-file-if-unchanged', tabId, rel, expected, content),
    createDir: (tabId: number, rel: string): Promise<void> =>
      ipcRenderer.invoke('fs:create-dir', tabId, rel),
    deletePath: (tabId: number, rel: string): Promise<void> =>
      ipcRenderer.invoke('fs:delete-path', tabId, rel),
    renamePath: (tabId: number, fromRel: string, toRel: string): Promise<void> =>
      ipcRenderer.invoke('fs:rename-path', tabId, fromRel, toRel),
    onChanged: (cb: (paths: string[]) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, paths: string[]): void => cb(paths ?? [])
      ipcRenderer.on('fs:changed', listener)
      return () => ipcRenderer.removeListener('fs:changed', listener)
    },
    searchInFiles: (requestId, tabId, query, opts): void =>
      ipcRenderer.send('fs:search-in-files', requestId, tabId, query, opts),
    searchCancel: (requestId: string): void => ipcRenderer.send('fs:search-cancel', requestId),
    onSearchResult: (cb) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        requestId: string,
        result: Parameters<typeof cb>[1]
      ): void => cb(requestId, result)
      ipcRenderer.on('fs:search-result', listener)
      return () => ipcRenderer.removeListener('fs:search-result', listener)
    },
    onSearchDone: (cb: (requestId: string, error?: string) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        requestId: string,
        error?: string
      ): void => cb(requestId, error)
      ipcRenderer.on('fs:search-done', listener)
      return () => ipcRenderer.removeListener('fs:search-done', listener)
    },
    listAllFiles: (tabId: number): Promise<string[]> =>
      ipcRenderer.invoke('fs:list-all-files', tabId)
  },
  media: {
    getUrl: (tabId: number, rel: string): Promise<string | null> =>
      ipcRenderer.invoke('media:get-url', tabId, rel),
    getUrlAbsolute: (absolutePath: string): Promise<string> =>
      ipcRenderer.invoke('media:get-url-absolute', absolutePath)
  },
  model3d: {
    openPreview: (tabId: number, rel: string) =>
      ipcRenderer.invoke('model:open-preview', tabId, rel),
    openAsset: (request) => ipcRenderer.invoke('model:open-asset', request),
    getImportJob: (jobId: string) => ipcRenderer.invoke('model:import-job', jobId),
    onImportStatus: (handler) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        job: Parameters<typeof handler>[0]
      ): void => handler(job)
      ipcRenderer.on('model:import-status', listener)
      return () => ipcRenderer.removeListener('model:import-status', listener)
    },
    getUrl: (tabId: number, rel: string): Promise<string | null> =>
      ipcRenderer.invoke('model:get-url', tabId, rel),
    log: (event: string, data?: Record<string, unknown>): Promise<void> =>
      ipcRenderer.invoke('model:log', event, data),
    logs: (limit) => ipcRenderer.invoke('model:logs', limit)
  },
  cad: {
    openFile: (tabId, rel) => ipcRenderer.invoke('cad:open-file', tabId, rel)
  },
  epub: {
    open: (tabId, rel) => ipcRenderer.invoke('epub:open', tabId, rel),
    openAbsolute: (absolutePath) => ipcRenderer.invoke('epub:open-absolute', absolutePath),
    getState: (tabId, rel, absolutePath) =>
      ipcRenderer.invoke('epub:state-get', tabId, rel, absolutePath),
    saveState: (tabId, rel, absolutePath, patch) =>
      ipcRenderer.invoke('epub:state-save', tabId, rel, absolutePath, patch)
  }
}
