import { browserFocusLog, snapshotBrowserFocusState } from "./browserFocusDebugLog";
import { setGuestWebContentsFocus } from "../layout/activeBrowserWebview";

/** Drop terminal keyboard ownership before handing focus to a browser guest. */
export function releaseTerminalFocusForBrowser(): void {
  for (const el of document.querySelectorAll(".xterm-helper-textarea")) {
    if (el instanceof HTMLElement) {
      el.blur();
    }
  }
  try {
    window.api.terminal.setFocused(null);
  } catch {
    /* preload may be unavailable in tests */
  }
}

/** Focus the <webview> host and hand keyboard to the guest WebContents. */
export function focusBrowserGuestWebview(webview: Electron.WebviewTag, reason: string): void {
  void focusBrowserGuestWebviewAsync(webview, reason);
}

export async function focusBrowserGuestWebviewAsync(
  webview: Electron.WebviewTag,
  reason: string,
): Promise<boolean> {
  releaseTerminalFocusForBrowser();
  try {
    webview.focus();
  } catch {
    browserFocusLog("focusBrowserGuestWebview", "webview.focus() threw", { reason });
    return false;
  }

  let webContentsId: number | null = null;
  try {
    webContentsId = webview.getWebContentsId();
  } catch {
    /* guest may not be attached yet */
  }

  if (webContentsId !== null) {
    try {
      const focused = await window.api.browser.focusGuest(webContentsId);
      if (focused) {
        setGuestWebContentsFocus(webContentsId, true);
      }
      browserFocusLog("focusBrowserGuestWebview", `${reason}:focus-guest-ipc`, {
        webContentsId,
        ipcOk: focused,
      });
    } catch {
      /* preload may be unavailable in tests */
    }
  }

  try {
    await webview.executeJavaScript(
      "(() => { try { window.focus(); const a = document.activeElement; if (a && a !== document.body) a.focus(); else document.body?.focus?.(); } catch {} })()",
      true,
    );
  } catch {
    /* guest may not be ready yet */
  }

  browserFocusLog("focusBrowserGuestWebview", reason, snapshotBrowserFocusState(webview));
  return isWebviewHostFocused(webview);
}

export function isWebviewHostFocused(webview: Electron.WebviewTag | null): boolean {
  if (!webview) return false;
  const active = document.activeElement;
  return active === webview || active?.closest?.("webview") === webview;
}
