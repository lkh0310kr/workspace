interface BrowserDownloadEventPayload { id:string; hostWebContentsId:number; phase:'started'|'updated'|'done'; filename?:string; url?:string; path?:string; receivedBytes?:number; totalBytes?:number; state?:'progressing'|'interrupted'|'completed'|'cancelled' }

import { ipcRenderer } from 'electron'

export const browserApi = {
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
    onGuestPointerDown: (cb: (payload: { webContentsId: number }) => void): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { webContentsId: number },
      ): void => cb(payload)
      ipcRenderer.on('browser:guest-pointer-down', listener)
      return () => ipcRenderer.removeListener('browser:guest-pointer-down', listener)
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
      ipcRenderer.invoke('browser:go-to-index', webContentsId, index),
    focusGuest: (webContentsId: number): Promise<boolean> =>
      ipcRenderer.invoke('browser:focus-guest', webContentsId),
    blurGuest: (webContentsId: number): Promise<boolean> =>
      ipcRenderer.invoke('browser:blur-guest', webContentsId)
  },
  shortcuts: {
    onHome: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:home', listener)
      return () => ipcRenderer.removeListener('shortcut:home', listener)
    },
    onQuickOpen: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:quick-open', listener)
      return () => ipcRenderer.removeListener('shortcut:quick-open', listener)
    },
    onFindInFiles: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:find-in-files', listener)
      return () => ipcRenderer.removeListener('shortcut:find-in-files', listener)
    },
    onBrowserReload: (cb: (payload: { hard: boolean }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { hard: boolean }): void => cb(payload)
      ipcRenderer.on('shortcut:browser-reload', listener)
      return () => ipcRenderer.removeListener('shortcut:browser-reload', listener)
    },
    onBrowserZoom: (
      cb: (payload: { direction: 'in' | 'out'; webContentsId: number }) => void,
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { direction: 'in' | 'out'; webContentsId: number },
      ): void => cb(payload)
      ipcRenderer.on('shortcut:browser-zoom', listener)
      return () => ipcRenderer.removeListener('shortcut:browser-zoom', listener)
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
    },
    onNewWorkspaceTab: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:new-workspace-tab', listener)
      return () => ipcRenderer.removeListener('shortcut:new-workspace-tab', listener)
    },
    onShortcutModifierReleased: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:modifier-released', listener)
      return () => ipcRenderer.removeListener('shortcut:modifier-released', listener)
    },
    onShortcutModifierPressed: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:modifier-pressed', listener)
      return () => ipcRenderer.removeListener('shortcut:modifier-pressed', listener)
    },
    onSwitchWorkspaceTabIndex: (cb: (payload: { index: number }) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { index: number },
      ): void => cb(payload)
      ipcRenderer.on('shortcut:switch-workspace-tab-index', listener)
      return () => ipcRenderer.removeListener('shortcut:switch-workspace-tab-index', listener)
    },
    onPastePlainText: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('shortcut:paste-plain-text', listener)
      return () => ipcRenderer.removeListener('shortcut:paste-plain-text', listener)
    },
    onTerminalPaste: (cb: (payload: { terminalId: number }) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { terminalId: number },
      ): void => cb(payload)
      ipcRenderer.on('shortcut:terminal-paste', listener)
      return () => ipcRenderer.removeListener('shortcut:terminal-paste', listener)
    }
  }
}
