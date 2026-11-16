import type { BrowserNavHistoryEntry } from './BrowserNavButton'
import type { BrowserDownloadItem } from './BrowserDownloadsBar'
import type { BrowserWebviewPort } from './BrowserWebview'

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
    webview: BrowserWebviewPort,
    context: {
      workspaceTabId: number
      paneNodeId: string
      paneTabItemId: string
      initialPaneVisible: boolean
      initialChipActive: boolean
    }
  ) => void
  detachWebview: (webview: BrowserWebviewPort) => void
  updateWebviewPaneNode: (webview: BrowserWebviewPort, paneNodeId: string) => void
  setPaneChipState: (
    workspaceTabId: number,
    paneTabItemId: string,
    state: { paneVisible: boolean; chipActive: boolean }
  ) => void
  requestGuestFocus: (workspaceTabId: number, paneTabItemId: string, reason: string) => void
  registerWebviewReference: (webview: BrowserWebviewPort) => () => void
  getActiveWebview: () => BrowserWebviewPort | null
  setActiveWebview: (webview: BrowserWebviewPort | null) => void
  moveFocusToRendererBeforeHide: () => void
  focusGuest: (webview: BrowserWebviewPort, reason: string) => void
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
  }) => { webview: BrowserWebviewPort; created: boolean } | null
  getPersistentWebview: (tabItemId: string) => BrowserWebviewPort | null
  setWebviewInputLock: (webview: BrowserWebviewPort, inputLocked: boolean) => void
  getDownloads: (webContentsId: number) => BrowserDownloadItem[]
  subscribeDownloads: (listener: () => void) => () => void
  revealDownload: (path: string) => void
  isGuestInteractive: (webview: BrowserWebviewPort) => boolean
  isGuestWebContentsFocused: (webContentsId: number) => boolean
  isWebviewHostFocused: (webview: BrowserWebviewPort) => boolean
  isDragPassthroughActive: () => boolean
  subscribeDragPassthrough: (listener: () => void) => () => void
  logFocus: (location: string, message: string, data?: Record<string, unknown>) => void
  snapshotFocus: (webview?: BrowserWebviewPort | null) => Record<string, unknown>
}
