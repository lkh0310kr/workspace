import { getBrowserPageViewportContainer } from "./browserPageViewport";
import { getPersistentBrowserWebview } from "../layout/browserWebviewRegistry";

/** True when the guest is missing or no longer in this page's container —
 * e.g. the viewport shell was recreated during render while the attach
 * effect's deps stayed the same, leaving a detached guest in the registry. */
export function browserPageGuestNeedsAttach(
  tabItemId: string,
  webview: Electron.WebviewTag | null,
): boolean {
  const container = getBrowserPageViewportContainer(tabItemId);
  if (!container) return true;
  const live = webview ?? getPersistentBrowserWebview(tabItemId) ?? null;
  if (!live) return true;
  return !live.isConnected || live.parentElement !== container;
}

/** Best-effort handle for toolbar actions when React's ref lags a registry
 * guest that is still connected in the overlay slot. */
export function resolveBrowserPageWebview(
  tabItemId: string,
  webviewRef: { current: Electron.WebviewTag | null },
): Electron.WebviewTag | null {
  const container = getBrowserPageViewportContainer(tabItemId);
  const candidates = [webviewRef.current, getPersistentBrowserWebview(tabItemId)].filter(
    Boolean,
  ) as Electron.WebviewTag[];
  for (const webview of candidates) {
    if (!webview.isConnected) continue;
    if (container && webview.parentElement !== container) continue;
    webviewRef.current = webview;
    return webview;
  }
  return null;
}
