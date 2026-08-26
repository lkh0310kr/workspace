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
  shell: {
    revealItemInDir: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal-item-in-dir', path)
  },
  usage: {
    claudeRateLimitStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:claude-rate-limit-status'),
    cursorUsageStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:cursor-usage-status')
  },
  dialog: {
    openDirectory: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:open-directory', defaultPath)
  },
  clipboard: {
    writeText: (text: string): void => ipcRenderer.send('clipboard:write-text', text)
  },
  debug: {
    interactionLog: (entry: Record<string, unknown>): void =>
      ipcRenderer.send('debug:interaction-log', entry),
    terminalLog: (entry: Record<string, unknown>): void =>
      ipcRenderer.send('debug:terminal-log', entry),
    layoutLog: (entry: Record<string, unknown>): void =>
      ipcRenderer.send('debug:layout-log', entry)
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
    onDownloadEvent: (cb: (payload: BrowserDownloadEventPayload) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: BrowserDownloadEventPayload): void =>
        cb(payload)
      ipcRenderer.on('browser:download-event', listener)
      return () => ipcRenderer.removeListener('browser:download-event', listener)
    },
    getNavHistory: (webContentsId: number): Promise<{
      entries: { url: string; title: string }[]
      activeIndex: number
    } | null> => ipcRenderer.invoke('browser:get-nav-history', webContentsId)
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
    spawn: (cols: number, rows: number): Promise<number> => ipcRenderer.invoke('pty:spawn', cols, rows),
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
    }
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
