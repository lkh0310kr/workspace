import { interactionCoordinator } from '../../../interaction/InteractionCoordinator'
import {
  getActiveBrowserWebview,
  registerBrowserWebview,
  setActiveBrowserWebview
} from '@renderer/features/browser/runtime/activeBrowserWebview'
import {
  getPersistentBrowserWebview,
  moveFocusToRendererBeforeFocusedWebviewHidden
} from '@renderer/features/browser/runtime/browserWebviewRegistry'
import {
  focusBrowserGuestWebview,
  requestBrowserKeyboardSurface
} from '@renderer/features/browser/runtime/browserGuestFocus'
import { onBrowserOpenNewTab } from './browserIpc'
import { revealItemInDir } from '../../app-shell/nativeShell'
import { fetchWebviewNavHistory, goToWebviewHistoryIndex } from './browserNavHistory'
import { onWorkspaceDismissPortals } from '../../../workspacePortalDismiss'
import {
  ensureBrowserPageWebview,
  setBrowserPageWebviewInputLock
} from './ensureBrowserPageWebview'
import { getBrowserDownloadsForWebview, subscribeBrowserDownloads } from './browserDownloads'
import {
  browserFocusLog,
  snapshotBrowserFocusState
} from '@renderer/features/browser/runtime/browserFocusDebugLog'
import { isWebviewHostFocused } from '@renderer/features/browser/runtime/browserGuestFocus'
import { isBrowserGuestWebContentsFocused } from '@renderer/features/browser/runtime/activeBrowserWebview'
import {
  isWebviewDragPassthroughActive,
  registerWebviewDragPassthroughSurface
} from '@renderer/features/browser/runtime/webviewDragPassthrough'
import type { BrowserPaneHost, BrowserWebviewPort } from '@workspace/browser'
export type { BrowserOpenNewTabEvent, BrowserPaneHost } from '@workspace/browser'

function asElectronWebview(webview: BrowserWebviewPort): Electron.WebviewTag {
  return webview as unknown as Electron.WebviewTag
}

function asBrowserWebview(webview: Electron.WebviewTag): BrowserWebviewPort {
  return webview as unknown as BrowserWebviewPort
}

/** Desktop adapter for Browser pane capabilities. Tests and other hosts can
 * mount BrowserContent with an in-memory implementation of BrowserPaneHost. */
export const desktopBrowserPaneHost: BrowserPaneHost = {
  registerPortal: (id, onDismiss) => interactionCoordinator.registerPortal(id, onDismiss),
  registerWebview: (webview, context) =>
    interactionCoordinator.registerWebview(asElectronWebview(webview), context),
  detachWebview: (webview) =>
    interactionCoordinator.detachBrowserWebview(asElectronWebview(webview)),
  updateWebviewPaneNode: (webview, paneNodeId) =>
    interactionCoordinator.updateWebviewPaneNode(asElectronWebview(webview), paneNodeId),
  setPaneChipState: (workspaceTabId, paneTabItemId, state) =>
    interactionCoordinator.setBrowserPaneChipState(workspaceTabId, paneTabItemId, state),
  requestGuestFocus: (workspaceTabId, paneTabItemId, reason) =>
    interactionCoordinator.requestBrowserGuestFocus(workspaceTabId, paneTabItemId, reason),
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
    interactionCoordinator.isGuestInteractive(asElectronWebview(webview)),
  isGuestWebContentsFocused: isBrowserGuestWebContentsFocused,
  isWebviewHostFocused: (webview) => isWebviewHostFocused(asElectronWebview(webview)),
  isDragPassthroughActive: isWebviewDragPassthroughActive,
  subscribeDragPassthrough: (listener) => registerWebviewDragPassthroughSurface(() => listener()),
  logFocus: browserFocusLog,
  snapshotFocus: (webview) =>
    snapshotBrowserFocusState(webview ? asElectronWebview(webview) : webview)
}
