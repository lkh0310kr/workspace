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
import { fetchWebviewNavHistory, goToWebviewHistoryIndex } from '../../browserNavHistory'
import { onWorkspaceDismissPortals } from '../../workspacePortalDismiss'
import type { BrowserPaneHost } from '@workspace/browser'
export type { BrowserOpenNewTabEvent, BrowserPaneHost } from '@workspace/browser'

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
  onOpenNewTab: (listener) => onBrowserOpenNewTab(listener),
  onDismissPortals: onWorkspaceDismissPortals,
  fetchNavHistory: fetchWebviewNavHistory,
  goToNavHistoryIndex: goToWebviewHistoryIndex
}
