import { ipcRenderer } from 'electron'

export const contentApi = {
  workspace: {
    getState: (): Promise<unknown> => ipcRenderer.invoke('workspace:get-state'),
    addTab: (): Promise<number> => ipcRenderer.invoke('workspace:add-tab'),
    closeTab: (tabId: number): Promise<void> => ipcRenderer.invoke('workspace:close-tab', tabId),
    selectTab: (tabId: number): Promise<void> => ipcRenderer.invoke('workspace:select-tab', tabId),
    renameTab: (tabId: number, title: string): Promise<void> =>
      ipcRenderer.invoke('workspace:rename-tab', tabId, title),
    reorderTabs: (orderedIds: number[]): Promise<void> =>
      ipcRenderer.invoke('workspace:reorder-tabs', orderedIds),
    setTabLayout: (tabId: number, layoutJson: string): Promise<void> =>
      ipcRenderer.invoke('workspace:set-tab-layout', tabId, layoutJson),
    setTabRootPath: (tabId: number, rootPath: string): Promise<unknown> =>
      ipcRenderer.invoke('workspace:set-tab-root-path', tabId, rootPath),
    onUpdated: (cb: (state: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown): void => cb(state)
      ipcRenderer.on('workspace:updated', listener)
      return () => ipcRenderer.removeListener('workspace:updated', listener)
    }
  },
  fs: {
    listDir: (tabId: number, rel: string): Promise<unknown> => ipcRenderer.invoke('fs:list-dir', tabId, rel),
    readFile: (tabId: number, rel: string): Promise<string> =>
      ipcRenderer.invoke('fs:read-file', tabId, rel),
    readFileBinaryPreview: (
      tabId: number,
      rel: string
    ): Promise<{ content: string; mimeType: string } | null> =>
      ipcRenderer.invoke('fs:read-file-binary-preview', tabId, rel),
    writeFile: (tabId: number, rel: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:write-file', tabId, rel, content),
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
    searchInFiles: (requestId: string, tabId: number, query: string, opts: unknown): void =>
      ipcRenderer.send('fs:search-in-files', requestId, tabId, query, opts),
    searchCancel: (requestId: string): void => ipcRenderer.send('fs:search-cancel', requestId),
    onSearchResult: (cb: (requestId: string, result: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, requestId: string, result: unknown): void =>
        cb(requestId, result)
      ipcRenderer.on('fs:search-result', listener)
      return () => ipcRenderer.removeListener('fs:search-result', listener)
    },
    onSearchDone: (cb: (requestId: string, error?: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, requestId: string, error?: string): void =>
        cb(requestId, error)
      ipcRenderer.on('fs:search-done', listener)
      return () => ipcRenderer.removeListener('fs:search-done', listener)
    },
    listAllFiles: (tabId: number): Promise<string[]> => ipcRenderer.invoke('fs:list-all-files', tabId)
  },
  media: {
    getUrl: (tabId: number, rel: string): Promise<string | null> =>
      ipcRenderer.invoke('media:get-url', tabId, rel),
    getUrlAbsolute: (absolutePath: string): Promise<string> =>
      ipcRenderer.invoke('media:get-url-absolute', absolutePath)
  },
  dashboard: {
    fetchWeather: (lat: number, lon: number): Promise<unknown> =>
      ipcRenderer.invoke('dashboard:fetch-weather', lat, lon),
    fetchEconomy: (): Promise<unknown> => ipcRenderer.invoke('dashboard:fetch-economy')
  },
  model3d: {
    openPreview: (tabId: number, rel: string): Promise<unknown> =>
      ipcRenderer.invoke('model:open-preview', tabId, rel),
    openAsset: (request: unknown): Promise<unknown> =>
      ipcRenderer.invoke('model:open-asset', request),
    getImportJob: (jobId: string): Promise<unknown> =>
      ipcRenderer.invoke('model:import-job', jobId),
    onImportStatus: (handler: (job: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, job: unknown) => handler(job)
      ipcRenderer.on('model:import-status', listener)
      return () => ipcRenderer.removeListener('model:import-status', listener)
    },
    getUrl: (tabId: number, rel: string): Promise<string | null> =>
      ipcRenderer.invoke('model:get-url', tabId, rel),
    log: (event: string, data?: Record<string, unknown>): Promise<void> =>
      ipcRenderer.invoke('model:log', event, data),
    logs: (limit?: number): Promise<unknown> => ipcRenderer.invoke('model:logs', limit),
  },
  cad: {
    openFile: (tabId: number, rel: string): Promise<unknown> =>
      ipcRenderer.invoke('cad:open-file', tabId, rel),
  },
  epub: {
    open: (tabId: number, rel: string): Promise<unknown> => ipcRenderer.invoke('epub:open', tabId, rel),
    openAbsolute: (absolutePath: string): Promise<unknown> =>
      ipcRenderer.invoke('epub:open-absolute', absolutePath),
    getState: (tabId: number | null, rel: string | null, absolutePath?: string): Promise<unknown> =>
      ipcRenderer.invoke('epub:state-get', tabId, rel, absolutePath),
    saveState: (
      tabId: number | null,
      rel: string | null,
      absolutePath: string | undefined,
      patch: unknown,
    ): Promise<unknown> => ipcRenderer.invoke('epub:state-save', tabId, rel, absolutePath, patch)
  },
  engine: {
    getBundleUrl: (
      tabId: number,
      rel: string,
      entry?: string,
    ): Promise<{ ok: true; url: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke('engine:get-bundle-url', tabId, rel, entry),
    exportGodotWeb: (tabId: number, rel: string): Promise<unknown> =>
      ipcRenderer.invoke('engine:export-godot-web', tabId, rel)
  },
  project: {
    registerApp: (tabId: number, kind: string, rel: string, title?: string): Promise<unknown> =>
      ipcRenderer.invoke('project:register-app', tabId, kind, rel, title)
  },
  worldEngine: {
    launch: (tabId: number, rel: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('worldEngine:launch', tabId, rel)
  },
  hardwareSim: {
    start: (tabId: number, rel: string): Promise<unknown> =>
      ipcRenderer.invoke('hardwareSim:start', tabId, rel),
    reload: (sessionId: number, reason: string): Promise<unknown> =>
      ipcRenderer.invoke('hardwareSim:reload', sessionId, reason),
    setButton: (
      sessionId: number,
      id: string,
      pressed: boolean
    ): Promise<unknown> =>
      ipcRenderer.invoke('hardwareSim:set-button', sessionId, id, pressed),
    stop: (sessionId: number): Promise<void> =>
      ipcRenderer.invoke('hardwareSim:stop', sessionId),
    onRuntime: (cb: (update: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: unknown): void => cb(update)
      ipcRenderer.on('hardwareSim:runtime', listener)
      return () => ipcRenderer.removeListener('hardwareSim:runtime', listener)
    },
    onStatus: (cb: (update: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: unknown): void => cb(update)
      ipcRenderer.on('hardwareSim:status', listener)
      return () => ipcRenderer.removeListener('hardwareSim:status', listener)
    }
  }
}
