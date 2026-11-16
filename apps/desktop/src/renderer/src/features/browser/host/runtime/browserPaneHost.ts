import { interactionCoordinator } from '@renderer/interaction/portals/InteractionCoordinator'
import { browserInteractionController } from './browserInteractionController'
import { closeBrowserTab } from './browserTabLifecycle'
import {
  getActiveBrowserWebview,
  registerBrowserWebview,
  setActiveBrowserWebview
} from '@renderer/features/browser/host/runtime/activeBrowserWebview'
import {
  getPersistentBrowserWebview,
  moveFocusToRendererBeforeFocusedWebviewHidden
} from '@renderer/features/browser/host/runtime/browserWebviewRegistry'
import {
  focusBrowserGuestWebview,
  requestBrowserKeyboardSurface
} from '@renderer/features/browser/host/runtime/browserGuestFocus'
import { onBrowserOpenNewTab } from './browserIpc'
import { revealItemInDir } from '@renderer/adapters/platform/nativeShell'
import { fetchWebviewNavHistory, goToWebviewHistoryIndex } from './browserNavHistory'
import { onWorkspaceDismissPortals } from '@renderer/interaction/portals/workspacePortalDismiss'
import {
  ensureBrowserPageWebview,
  setBrowserPageWebviewInputLock
} from './ensureBrowserPageWebview'
import { getBrowserDownloadsForWebview, subscribeBrowserDownloads } from './browserDownloads'
import {
  browserFocusLog,
  snapshotBrowserFocusState
} from '@renderer/features/browser/host/runtime/browserFocusDebugLog'
import { isWebviewHostFocused } from '@renderer/features/browser/host/runtime/browserGuestFocus'
import { isBrowserGuestWebContentsFocused } from '@renderer/features/browser/host/runtime/activeBrowserWebview'
import {
  isWebviewDragPassthroughActive,
  registerWebviewDragPassthroughSurface
} from '@renderer/features/browser/host/runtime/webviewDragPassthrough'
import type { BrowserPaneHost, BrowserWebviewPort } from '@workspace/browser'
export type { BrowserOpenNewTabEvent, BrowserPaneHost } from '@workspace/browser'

function asElectronWebview(webview: BrowserWebviewPort): Electron.WebviewTag {
  return webview as unknown as Electron.WebviewTag
}

function asBrowserWebview(webview: Electron.WebviewTag): BrowserWebviewPort {
  return webview as unknown as BrowserWebviewPort
}

/** Desktop adapter for Browser view and guest-lifecycle capabilities. */
export const desktopBrowserPaneHost: BrowserPaneHost = {
  closeTabItem: closeBrowserTab,
  registerPortal: (id, onDismiss) => interactionCoordinator.registerPortal(id, onDismiss),
  registerWebview: (webview, context) =>
    browserInteractionController.registerWebview(asElectronWebview(webview), context),
  detachWebview: (webview) =>
    browserInteractionController.detachWebview(asElectronWebview(webview)),
  updateWebviewPaneNode: (webview, paneNodeId) =>
    browserInteractionController.updateWebviewPaneNode(asElectronWebview(webview), paneNodeId),
  setPaneChipState: (workspaceTabId, paneTabItemId, state) =>
    browserInteractionController.setPaneChipState(workspaceTabId, paneTabItemId, state),
  requestGuestFocus: (workspaceTabId, paneTabItemId, reason) =>
    browserInteractionController.requestGuestFocus(workspaceTabId, paneTabItemId, reason),
  registerWebviewReference: (webview) => registerBrowserWebview(asElectronWebview(webview)),
  getActiveWebview: () => {
    const webview = getActiveBrowserWebview()
    return webview ? asBrowserWebview(webview) : null
  },
  setActiveWebview: (webview) =>
    setActiveBrowserWebview(webview ? asElectronWebview(webview) : null),
  moveFocusToRendererBeforeHide: moveFocusToRendererBeforeFocusedWebviewHidden,
  focusGuest: (webview, reason) => focusBrowserGuestWebview(asElectronWebview(webview), reason),
  requestKeyboardSurface: requestBrowserKeyboardSurface,
  onOpenNewTab: (listener) => onBrowserOpenNewTab(listener),
  onDismissPortals: onWorkspaceDismissPortals,
  fetchNavHistory: fetchWebviewNavHistory,
  goToNavHistoryIndex: goToWebviewHistoryIndex,
  ensureWebview: (args) => {
    const ensured = ensureBrowserPageWebview(args)
    return ensured ? { ...ensured, webview: asBrowserWebview(ensured.webview) } : null
  },
  getPersistentWebview: (tabItemId) => {
    const webview = getPersistentBrowserWebview(tabItemId)
    return webview ? asBrowserWebview(webview) : null
  },
  setWebviewInputLock: (webview, inputLocked) =>
    setBrowserPageWebviewInputLock(asElectronWebview(webview), inputLocked),
  getDownloads: getBrowserDownloadsForWebview,
  subscribeDownloads: subscribeBrowserDownloads,
  revealDownload: (path) => {
    revealItemInDir(path).catch(console.error)
  },
  isGuestInteractive: (webview) =>
    browserInteractionController.isGuestInteractive(asElectronWebview(webview)),
  isGuestWebContentsFocused: isBrowserGuestWebContentsFocused,
  isWebviewHostFocused: (webview) => isWebviewHostFocused(asElectronWebview(webview)),
  isDragPassthroughActive: isWebviewDragPassthroughActive,
  subscribeDragPassthrough: (listener) => registerWebviewDragPassthroughSurface(() => listener()),
  logFocus: browserFocusLog,
  snapshotFocus: (webview) =>
    snapshotBrowserFocusState(webview ? asElectronWebview(webview) : webview)
}
