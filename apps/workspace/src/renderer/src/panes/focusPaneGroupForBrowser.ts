import { browserFocusLog } from "../browser/browserFocusDebugLog";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { getBrowserWebviewByWebContentsId } from "../layout/activeBrowserWebview";
import { focusPaneGroupTabSet } from "../layout/layoutRef";

/** Orca focusGroup parity — dimming split follows the pane group that owns the clicked guest. */
export function focusPaneGroupForPaneNode(workspaceTabId: number, paneNodeId: string): void {
  const host = document.querySelector<HTMLElement>(`[data-pane-node-id="${paneNodeId}"]`);
  const tabSetId = host?.dataset.paneTabsetId;
  browserFocusLog("focusPaneGroupForPaneNode", tabSetId ? "focus tabset" : "missing tabSetId", {
    workspaceTabId,
    paneNodeId,
    tabSetId,
    foundHost: Boolean(host),
  });
  if (!tabSetId) return;
  focusPaneGroupTabSet(workspaceTabId, tabSetId);
}

export function focusPaneGroupForBrowserWebview(webview: Electron.WebviewTag): void {
  const reg = interactionCoordinator.lookupWebviewRegistration(webview);
  if (!reg) return;
  focusPaneGroupForPaneNode(reg.workspaceTabId, reg.paneNodeId);
}

export function focusPaneGroupForGuestWebContents(webContentsId: number): void {
  const webview = getBrowserWebviewByWebContentsId(webContentsId);
  if (!webview) return;
  focusPaneGroupForBrowserWebview(webview);
}
