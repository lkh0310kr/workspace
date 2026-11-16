import type { BrowserNavHistoryEntry } from './BrowserNavButton'
import type { BrowserDownloadItem } from './BrowserDownloadsBar'

export interface BrowserPaneItem {
  id: string
  url?: string
  title?: string
  favicon?: string
  zoomFactor?: number
}

export type BrowserOpenNewTabEvent = { hostWebContentsId: number; url: string }

/** Desktop capabilities consumed by the browser pane slice. */
export interface BrowserPaneHost {
  registerPortal: (id: string, onDismiss: () => void) => () => void
  registerWebview: (
    webview: Electron.WebviewTag,
    context: {
      workspaceTabId: number
      paneNodeId: string
      paneTabItemId: string
      initialPaneVisible: boolean
      initialChipActive: boolean
    }
  ) => void
  detachWebview: (webview: Electron.WebviewTag) => void
  updateWebviewPaneNode: (webview: Electron.WebviewTag, paneNodeId: string) => void
  setPaneChipState: (
    workspaceTabId: number,
    paneTabItemId: string,
    state: { paneVisible: boolean; chipActive: boolean }
  ) => void
  requestGuestFocus: (workspaceTabId: number, paneTabItemId: string, reason: string) => void
  registerWebviewReference: (webview: Electron.WebviewTag) => () => void
  getActiveWebview: () => Electron.WebviewTag | null
  setActiveWebview: (webview: Electron.WebviewTag | null) => void
  moveFocusToRendererBeforeHide: () => void
  focusGuest: (webview: Electron.WebviewTag, reason: string) => void
  requestKeyboardSurface: (reason: string) => void
  onOpenNewTab: (listener: (event: BrowserOpenNewTabEvent) => void) => () => void
  onDismissPortals: (handler: () => void) => () => void
  fetchNavHistory: (
    webContentsId: number
  ) => Promise<{ entries: BrowserNavHistoryEntry[]; activeIndex: number } | null>
  goToNavHistoryIndex: (webContentsId: number, index: number) => Promise<void>
  ensureWebview: (args: {
    tabItemId: string
    container: HTMLDivElement
    initialUrl: string
    initialZoom: number
  }) => { webview: Electron.WebviewTag; created: boolean } | null
  getPersistentWebview: (tabItemId: string) => Electron.WebviewTag | null
  setWebviewInputLock: (webview: Electron.WebviewTag, inputLocked: boolean) => void
  getDownloads: (webContentsId: number) => BrowserDownloadItem[]
  subscribeDownloads: (listener: () => void) => () => void
  revealDownload: (path: string) => void
  isGuestInteractive: (webview: Electron.WebviewTag) => boolean
  isGuestWebContentsFocused: (webContentsId: number) => boolean
  isWebviewHostFocused: (webview: Electron.WebviewTag) => boolean
  isDragPassthroughActive: () => boolean
  subscribeDragPassthrough: (listener: () => void) => () => void
  logFocus: (location: string, message: string, data?: Record<string, unknown>) => void
  snapshotFocus: (webview?: Electron.WebviewTag | null) => Record<string, unknown>
}
