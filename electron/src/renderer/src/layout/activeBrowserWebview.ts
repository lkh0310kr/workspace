// Tracks whichever <webview> currently has real focus, so the global
// Cmd+R/Cmd+Shift+R handler (App.tsx) knows which one to reload — multiple
// browser tabs can exist across different panes/splits simultaneously, and
// only one pane's content can genuinely be focused at a time.
//
// Primary signal: guest WebContents focus/blur relayed from main via IPC
// (web-contents-created in main/index.ts) — renderer DOM focus on the
// <webview> host element is unreliable across Electron versions.
//
// Secondary signals kept as belt-and-suspenders:
//   - BrowserContent focus/blur on the <webview> element itself
//   - installBrowserFocusTracking() clears when focus leaves browser chrome
//   - BrowserContent calls webview.focus() when its tab becomes visible

import {
  browserFocusLog,
  setBrowserGuestFocusDebugState,
} from "../browser/browserFocusDebugLog";

const registry = new Map<number, Electron.WebviewTag>();
let current: Electron.WebviewTag | null = null;

export function registerBrowserWebview(webview: Electron.WebviewTag): () => void {
  let id: number;
  try {
    id = webview.getWebContentsId();
  } catch {
    return () => {};
  }
  registry.set(id, webview);
  return () => {
    registry.delete(id);
    if (current === webview) current = null;
  };
}

export function setGuestWebContentsFocus(webContentsId: number, focused: boolean): void {
  setBrowserGuestFocusDebugState(webContentsId, focused);
  const webview = registry.get(webContentsId);
  browserFocusLog("activeBrowserWebview.setGuestWebContentsFocus", focused ? "guest focused" : "guest blurred", {
    webContentsId,
    hasWebview: Boolean(webview),
    tabItemId: webview?.dataset.tabItemId,
  });
  if (!webview) return;
  if (focused) current = webview;
  else if (current === webview) current = null;
}

export function setActiveBrowserWebview(webview: Electron.WebviewTag | null): void {
  current = webview;
}

export function getActiveBrowserWebview(): Electron.WebviewTag | null {
  return current;
}

export function getBrowserWebviewByWebContentsId(
  webContentsId: number,
): Electron.WebviewTag | null {
  return registry.get(webContentsId) ?? null;
}

export function installBrowserFocusTracking(): () => void {
  const onFocusIn = (e: FocusEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target?.closest(".browser-pane-chrome")) return;
    current = null;
  };
  document.addEventListener("focusin", onFocusIn);
  return () => document.removeEventListener("focusin", onFocusIn);
}

export function installBrowserGuestFocusRelay(): () => void {
  const listener = window.api.browser.onGuestFocus(({ webContentsId, focused }) => {
    setGuestWebContentsFocus(webContentsId, focused);
  });
  return listener;
}
