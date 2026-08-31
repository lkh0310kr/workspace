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

export function getBrowserGuestFocusWebContentsId(): number | null {
  return lastGuestFocusWebContentsId;
}

function collectViewportShells(): Array<Record<string, unknown>> {
  return [...document.querySelectorAll<HTMLElement>("[data-browser-page-viewport-id]")].map((shell) => {
    const rect = shell.getBoundingClientRect();
    return {
      tabItemId: shell.dataset.browserPageViewportId ?? "",
      display: shell.style.display,
      opacity: shell.style.opacity,
      pointerEvents: shell.style.pointerEvents,
      inert: shell.inert,
      rect: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
    };
  });
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
      viewports: collectViewportShells(),
    },
  };
  ring.push(entry);
  if (ring.length > MAX_RING) ring.shift();
  try {
    window.api?.debug?.interactionLog({
      sessionId: "browser-focus",
      ...entry,
    });
  } catch {
    /* preload may be unavailable in tests */
  }
  if (isDevInstrumentation) {
    console.debug(`[browser-focus] ${location}: ${message}`, entry.data);
  }
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
  const host = webview?.closest(".browser-content-slot-host");
  const hostRect = host?.getBoundingClientRect();
  return {
    webContentsId,
    guestFocusWebContentsId: lastGuestFocusWebContentsId,
    url,
    activeElement: summarizeActiveElement(),
    webviews: collectWebviews(),
    viewports: collectViewportShells(),
    hostRect: hostRect ? { w: hostRect.width, h: hostRect.height } : null,
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
