import {
  getActiveBrowserWebview,
  installBrowserFocusTracking,
  installBrowserGuestFocusRelay,
} from "../layout/activeBrowserWebview";

/** One-shot setup for browser guest focus tracking (Cmd+R target, etc.). */
export function installBrowserEmbedSupport(): () => void {
  const unlistenFocus = installBrowserFocusTracking();
  const unlistenGuest = installBrowserGuestFocusRelay();
  return () => {
    unlistenFocus();
    unlistenGuest();
  };
}

export function reloadFocusedBrowser(hard: boolean): void {
  const webview = getActiveBrowserWebview();
  if (!webview) return;
  if (hard) webview.reloadIgnoringCache();
  else webview.reload();
}
