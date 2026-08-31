import { isDevInstrumentation } from "../debug/devTools";
import { collectWebviews } from "../interaction/interactionDebugLog";

const MAX_RING = 200;

export type BrowserFocusLogEntry = {
  timestamp: number;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

const ring: BrowserFocusLogEntry[] = [];
let lastGuestFocusWebContentsId: number | null = null;

export function setBrowserGuestFocusDebugState(webContentsId: number | null, focused: boolean): void {
  lastGuestFocusWebContentsId = focused ? webContentsId : null;
}

export function browserFocusLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: BrowserFocusLogEntry = {
    timestamp: Date.now(),
    location,
    message,
    data: {
      ...data,
      activeElement: summarizeActiveElement(),
      guestFocusWebContentsId: lastGuestFocusWebContentsId,
    },
  };
  ring.push(entry);
  if (ring.length > MAX_RING) ring.shift();
  if (!isDevInstrumentation) return;
  try {
    window.api?.debug?.interactionLog({
      sessionId: "browser-focus",
      ...entry,
    });
  } catch {
    /* ignore */
  }
  console.debug(`[browser-focus] ${location}: ${message}`, entry.data);
}

function summarizeActiveElement(): Record<string, string> | null {
  const el = document.activeElement;
  if (!el) return null;
  const html = el as HTMLElement;
  return {
    tag: el.tagName.toLowerCase(),
    className: typeof html.className === "string" ? html.className.slice(0, 80) : "",
    id: html.id || "",
  };
}

export function snapshotBrowserFocusState(webview?: Electron.WebviewTag | null): Record<string, unknown> {
  let webContentsId: number | null = null;
  let url = "";
  try {
    if (webview) {
      webContentsId = webview.getWebContentsId();
      url = webview.getURL();
    }
  } catch {
    /* guest mid-teardown */
  }
  return {
    webContentsId,
    guestFocusWebContentsId: lastGuestFocusWebContentsId,
    url,
    activeElement: summarizeActiveElement(),
    webviews: collectWebviews(),
    inline: webview
      ? {
          display: webview.style.display,
          visibility: webview.style.visibility,
          pointerEvents: webview.style.pointerEvents,
          inert: webview.inert,
        }
      : null,
  };
}

export function getBrowserFocusLogRing(): readonly BrowserFocusLogEntry[] {
  return ring;
}
