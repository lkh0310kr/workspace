import {
  getActiveBrowserWebview,
  installBrowserFocusTracking,
  installBrowserGuestFocusRelay,
} from "../layout/activeBrowserWebview";
import { onBrowserZoomShortcut } from "../electron";
import {
  addBrowserZoomEventListener,
  zoomBrowserWebview,
} from "./browserZoom";
import { getBrowserFocusLogRing } from "./browserFocusDebugLog";
import { isDevInstrumentation } from "../debug/devTools";

/** One-shot setup for browser guest focus tracking (Cmd+R target, etc.). */
export function installBrowserEmbedSupport(): () => void {
  const unlistenFocus = installBrowserFocusTracking();
  const unlistenGuest = installBrowserGuestFocusRelay();
  const unlistenZoom = onBrowserZoomShortcut(({ direction, webContentsId }) => {
    zoomBrowserWebview(direction, webContentsId);
  });
  const removeLocalZoom = addBrowserZoomEventListener(({ direction }) => {
    zoomBrowserWebview(direction);
  });
  if (isDevInstrumentation && typeof window !== "undefined") {
    (window as Window & { __browserFocusLog?: () => readonly unknown[] }).__browserFocusLog =
      () => getBrowserFocusLogRing();
  }
  return () => {
    unlistenFocus();
    unlistenGuest();
    unlistenZoom();
    removeLocalZoom();
  };
}

export function reloadFocusedBrowser(hard: boolean): void {
  const webview = getActiveBrowserWebview();
  if (!webview) return;
  if (hard) webview.reloadIgnoringCache();
  else webview.reload();
}
