import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface BrowserDownloadEventPayload {
  id: string
  hostWebContentsId: number
  phase: 'started' | 'updated' | 'done'
  filename?: string
  url?: string
  path?: string
  receivedBytes?: number
  totalBytes?: number
  state?: 'progressing' | 'interrupted' | 'completed' | 'cancelled'
}

// Custom APIs for renderer
const api = {
  hostname: (): Promise<string> => ipcRenderer.invoke('hostname'),
  platform: process.platform as NodeJS.Platform,
  // Preload has Node; cheap sync check so CSS can skip titleBarOverlay padding.
  isWsl:
    process.platform === 'linux' &&
    ((): boolean => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
      } catch {
        return false
      }
    })(),
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close')
  },
  shell: {
    revealItemInDir: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal-item-in-dir', path)
  },
  usage: {
    claudeRateLimitStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:claude-rate-limit-status'),
    cursorUsageStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:cursor-usage-status')
  },
  dialog: {
    openDirectory: (defaultPath?: string) => ipcRenderer.invoke('dialog:open-directory', defaultPath),
    pickMediaFile: (kind: 'video' | 'audio' | 'ebook') =>
      ipcRenderer.invoke('dialog:pick-media-file', kind)
  },
  clipboard: {
    writeText: (text: string): void => ipcRenderer.send('clipboard:write-text', text)
  },
  debug: import.meta.env.DEV
    ? {
        interactionLog: (entry: Record<string, unknown>): void =>
          ipcRenderer.send('debug:interaction-log', entry),
        terminalLog: (entry: Record<string, unknown>): void =>
          ipcRenderer.send('debug:terminal-log', entry),
        layoutLog: (entry: Record<string, unknown>): void =>
          ipcRenderer.send('debug:layout-log', entry)
      }
    : {
        interactionLog: (): void => {},
        terminalLog: (): void => {},
        layoutLog: (): void => {}
      },
  browser: {
    onOpenNewTab: (cb: (payload: { hostWebContentsId: number; url: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { hostWebContentsId: number; url: string }): void =>
        cb(payload)
      ipcRenderer.on('browser:open-new-tab', listener)
      return () => ipcRenderer.removeListener('browser:open-new-tab', listener)
    },
    onGuestFocus: (cb: (payload: { webContentsId: number; focused: boolean }) => void): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { webContentsId: number; focused: boolean },
      ): void => cb(payload)
      ipcRenderer.on('browser:guest-focus', listener)
      return () => ipcRenderer.removeListener('browser:guest-focus', listener)
    },
    onHtmlFullscreenChanged: (cb: (active: boolean) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, active: boolean): void => cb(active)
      ipcRenderer.on('browser:html-fullscreen-changed', listener)
      return () => ipcRenderer.removeListener('browser:html-fullscreen-changed', listener)
    },
    onDownloadEvent: (cb: (payload: BrowserDownloadEventPayload) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: BrowserDownloadEventPayload): void =>
        cb(payload)
      ipcRenderer.on('browser:download-event', listener)
      return () => ipcRenderer.removeListener('browser:download-event', listener)
    },
    getNavHistory: (webContentsId: number): Promise<{
      entries: { url: string; title: string }[]
      activeIndex: number
    } | null> => ipcRenderer.invoke('browser:get-nav-history', webContentsId),
    goBack: (webContentsId: number): Promise<boolean> =>
      ipcRenderer.invoke('browser:go-back', webContentsId),
    goForward: (webContentsId: number): Promise<boolean> =>
      ipcRenderer.invoke('browser:go-forward', webContentsId),
    goToIndex: (webContentsId: number, index: number): Promise<boolean> =>
      ipcRenderer.invoke('browser:go-to-index', webContentsId, index)
  },
  shortcuts: {
    onBrowserReload: (cb: (payload: { hard: boolean }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { hard: boolean }): void => cb(payload)
      ipcRenderer.on('shortcut:browser-reload', listener)
      return () => ipcRenderer.removeListener('shortcut:browser-reload', listener)
    },
    onClosePaneTab: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:close-pane-tab', listener)
      return () => ipcRenderer.removeListener('shortcut:close-pane-tab', listener)
    },
    onOpenSettings: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:open-settings', listener)
      return () => ipcRenderer.removeListener('shortcut:open-settings', listener)
    }
  },
  terminal: {
    setFocused: (id: number | null): void => ipcRenderer.send('terminal:set-focused', id),
    onClearOptionModifiers: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('terminal:clear-option-modifiers', listener)
      return () => ipcRenderer.removeListener('terminal:clear-option-modifiers', listener)
    }
  },
  pty: {
    spawn: (cols: number, rows: number, tabId?: number): Promise<number> =>
      ipcRenderer.invoke('pty:spawn', cols, rows, tabId),
    connect: (id: number): Promise<{
      id: number
      snapshot: string
      snapshotCols: number
      snapshotRows: number
      lastSeq: number
      isReattach: boolean
    }> => ipcRenderer.invoke('pty:connect', id),
    disconnect: (id: number): void => ipcRenderer.send('pty:disconnect', id),
    write: (id: number, data: Uint8Array): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    dispose: (id: number): void => ipcRenderer.send('pty:dispose', id),
    onData: (cb: (id: number, seq: number, data: Uint8Array) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: number; seq: number; data: Uint8Array },
      ): void => cb(payload.id, payload.seq, payload.data)
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    }
  },
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
    onChanged: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
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
  rss: {
    fetchFeed: (url: string): Promise<unknown> => ipcRenderer.invoke('rss:fetch-feed', url)
  },
  epub: {
    open: (tabId: number, rel: string): Promise<unknown> => ipcRenderer.invoke('epub:open', tabId, rel),
    openAbsolute: (absolutePath: string): Promise<unknown> =>
      ipcRenderer.invoke('epub:open-absolute', absolutePath)
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
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
