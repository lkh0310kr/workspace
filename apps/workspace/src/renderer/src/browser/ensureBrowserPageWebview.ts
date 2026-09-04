// Orca parity — host-guest/browser-page-webview.ts

import { BROWSER_SESSION_PARTITION } from "../browserSessionPartition";
import { normalizeBrowserNavigationUrl, BLANK_URL } from "../browserUrl";
import {
  claimParkedBrowserWebview,
  destroyBrowserWebview,
  getPersistentBrowserWebview,
  registerPersistentWebview,
} from "../layout/browserWebviewRegistry";

export function setBrowserPageWebviewInputLock(
  webview: Electron.WebviewTag,
  inputLocked: boolean,
): void {
  webview.style.pointerEvents = inputLocked ? "none" : "auto";
}

export function ensureBrowserPageWebview({
  tabItemId,
  container,
  initialUrl,
  initialZoom,
}: {
  tabItemId: string;
  container: HTMLDivElement;
  initialUrl: string;
  initialZoom: number;
}): { webview: Electron.WebviewTag; created: boolean } | null {
  let webview =
    claimParkedBrowserWebview(tabItemId, container) ?? getPersistentBrowserWebview(tabItemId);
  let created = false;

  if (webview && webview.parentElement !== container) {
    if (!webview.isConnected) {
      destroyBrowserWebview(tabItemId);
      webview = undefined;
    } else {
      container.appendChild(webview);
    }
  }

  if (webview) {
    setBrowserPageWebviewInputLock(webview, false);
    if (container !== webview.parentElement) {
      container.appendChild(webview);
    }
    return { webview, created };
  }

  webview = document.createElement("webview") as Electron.WebviewTag;
  webview.setAttribute("partition", BROWSER_SESSION_PARTITION);
  webview.setAttribute("src", normalizeBrowserNavigationUrl(initialUrl, false) ?? BLANK_URL);
  webview.setAttribute("allowpopups", "");
  webview.setAttribute("webpreferences", "contextIsolation=yes,webgl=yes");
  webview.dataset.tabItemId = tabItemId;
  webview.style.display = "flex";
  webview.style.flex = "1";
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.style.border = "none";
  webview.style.background = "#ffffff";
  setBrowserPageWebviewInputLock(webview, false);
  try {
    webview.setZoomFactor(initialZoom);
  } catch {
    /* guest may not be ready */
  }
  registerPersistentWebview(tabItemId, webview);
  container.appendChild(webview);
  created = true;
  return { webview, created };
}
