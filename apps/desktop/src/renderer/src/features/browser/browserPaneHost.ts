import { interactionCoordinator } from '../../interaction/InteractionCoordinator'
import {
  getActiveBrowserWebview,
  registerBrowserWebview,
  setActiveBrowserWebview
} from '../../layout/activeBrowserWebview'
import { moveFocusToRendererBeforeFocusedWebviewHidden } from '../../layout/browserWebviewRegistry'
import {
  focusBrowserGuestWebview,
  requestBrowserKeyboardSurface
} from '../../browser/browserGuestFocus'
import { onBrowserOpenNewTab } from '../../electron'

export type BrowserOpenNewTabEvent = { hostWebContentsId: number; url: string }

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
}

/** Desktop adapter for Browser pane capabilities. Tests and other hosts can
 * mount BrowserContent with an in-memory implementation of BrowserPaneHost. */
export const desktopBrowserPaneHost: BrowserPaneHost = {
  registerPortal: (id, onDismiss) => interactionCoordinator.registerPortal(id, onDismiss),
  registerWebview: (webview, context) => interactionCoordinator.registerWebview(webview, context),
  detachWebview: (webview) => interactionCoordinator.detachBrowserWebview(webview),
  updateWebviewPaneNode: (webview, paneNodeId) =>
    interactionCoordinator.updateWebviewPaneNode(webview, paneNodeId),
  setPaneChipState: (workspaceTabId, paneTabItemId, state) =>
    interactionCoordinator.setBrowserPaneChipState(workspaceTabId, paneTabItemId, state),
  requestGuestFocus: (workspaceTabId, paneTabItemId, reason) =>
    interactionCoordinator.requestBrowserGuestFocus(workspaceTabId, paneTabItemId, reason),
  registerWebviewReference: registerBrowserWebview,
  getActiveWebview: getActiveBrowserWebview,
  setActiveWebview: setActiveBrowserWebview,
  moveFocusToRendererBeforeHide: moveFocusToRendererBeforeFocusedWebviewHidden,
  focusGuest: focusBrowserGuestWebview,
  requestKeyboardSurface: requestBrowserKeyboardSurface,
  onOpenNewTab: (listener) => onBrowserOpenNewTab(listener)
}
