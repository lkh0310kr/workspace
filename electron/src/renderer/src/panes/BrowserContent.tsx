import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserAddressBar } from "../components/BrowserAddressBar";
import { BrowserNavButton } from "../components/BrowserNavButton";
import { BrowserDownloadsBar } from "../components/BrowserDownloadsBar";
import { normalizeBrowserNavigationUrl, BLANK_URL } from "../browserUrl";
import { recordBrowserVisit } from "../browserHistory";
import { BROWSER_SESSION_PARTITION } from "../browserSessionPartition";
import { onBrowserOpenNewTab } from "../electron";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { dbgLog } from "../interaction/interactionDebugLog";
import { setActiveBrowserWebview, getActiveBrowserWebview, registerBrowserWebview } from "../layout/activeBrowserWebview";
import type { PaneTabItem } from "../layout/paneTypes";

// The per-page content half of what used to be BrowserPane.tsx — tab-strip
// ownership (open/close/switch pages) moved up to PaneGroup.tsx as part of
// globalizing the tab system, same as EditorContent.tsx. What's still
// genuinely page-specific stays here: the <webview> guest itself and its
// own nav+address bar row.
interface Props {
  tabId: number;
  item: PaneTabItem;
  visible: boolean;
  onUpdate: (patch: Partial<PaneTabItem>) => void;
  /** target="_blank"/window.open() inside the guest page — main/index.ts
   * denies the native window and forwards the URL here; caller opens it
   * as a new browser tab in this pane's group. */
  onOpenNewTab: (url: string) => void;
}

const DEFAULT_URL = "https://www.google.com";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function applyWebviewZoom(webview: Electron.WebviewTag, factor: number): void {
  try {
    webview.setZoomFactor(factor);
  } catch {
    // webview may be mid-teardown.
  }
}

export function BrowserContent({ tabId, item, visible, onUpdate, onOpenNewTab }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [webview, setWebview] = useState<Electron.WebviewTag | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [addressInput, setAddressInput] = useState(item.url ?? DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(item.url ?? DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [webContentsId, setWebContentsId] = useState<number | null>(null);
  const [zoomFactor, setZoomFactor] = useState(item.zoomFactor ?? 1);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onOpenNewTabRef = useRef(onOpenNewTab);
  onOpenNewTabRef.current = onOpenNewTab;

  const syncNavState = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    setCanGoBack(webview.canGoBack());
    setCanGoForward(webview.canGoForward());
  }, []);

  const setZoom = useCallback((next: number) => {
    const clamped = clampZoom(next);
    setZoomFactor(clamped);
    onUpdateRef.current({ zoomFactor: clamped });
    const webview = webviewRef.current;
    if (webview) applyWebviewZoom(webview, clamped);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialZoom = item.zoomFactor ?? 1;
    const guest = document.createElement("webview") as Electron.WebviewTag;
    guest.setAttribute("partition", BROWSER_SESSION_PARTITION);
    guest.setAttribute("src", normalizeBrowserNavigationUrl(item.url ?? DEFAULT_URL, false) ?? BLANK_URL);
    guest.setAttribute("allowpopups", "");
    guest.dataset.tabItemId = item.id;
    guest.style.width = "100%";
    guest.style.height = "100%";
    guest.style.border = "none";
    guest.style.background = "#ffffff";
    container.appendChild(guest);
    webviewRef.current = guest;
    setWebview(guest);
    applyWebviewZoom(guest, initialZoom);
    setZoomFactor(initialZoom);

    try {
      setWebContentsId(guest.getWebContentsId());
    } catch {
      setWebContentsId(null);
    }

    const onStartLoading = (): void => setLoading(true);
    const onStopLoading = (): void => {
      setLoading(false);
      syncNavState();
    };
    const onNavigate = (e: Electron.DidNavigateEvent): void => {
      setAddressInput(e.url);
      setCurrentUrl(e.url);
      onUpdateRef.current({ url: e.url });
      syncNavState();
    };
    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      setAddressInput(e.url);
      setCurrentUrl(e.url);
      onUpdateRef.current({ url: e.url });
      syncNavState();
    };
    const onPageTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      onUpdateRef.current({ title: e.title });
      try {
        recordBrowserVisit(guest.getURL(), e.title);
      } catch {
        // webview can be mid-teardown when this fires.
      }
    };
    const onFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent): void => {
      const favicon = e.favicons[0];
      if (favicon) onUpdateRef.current({ favicon });
    };

    guest.addEventListener("did-start-loading", onStartLoading);
    guest.addEventListener("did-stop-loading", onStopLoading);
    guest.addEventListener("did-navigate", onNavigate);
    guest.addEventListener("did-navigate-in-page", onNavigateInPage);
    guest.addEventListener("page-title-updated", onPageTitleUpdated);
    guest.addEventListener("page-favicon-updated", onFaviconUpdated);

    const unregisterWebview = registerBrowserWebview(guest);
    interactionCoordinator.registerWebview(guest, {
      workspaceTabId: tabId,
      paneTabItemId: item.id,
      initialPaneVisible: visible,
    });

    const onFocus = (): void => setActiveBrowserWebview(guest);
    const onBlur = (): void => {
      if (getActiveBrowserWebview() === guest) setActiveBrowserWebview(null);
    };
    guest.addEventListener("focus", onFocus);
    guest.addEventListener("blur", onBlur);

    const unlistenOpenNewTab = onBrowserOpenNewTab(({ hostWebContentsId, url }) => {
      let myId: number;
      try {
        myId = guest.getWebContentsId();
      } catch {
        return;
      }
      if (myId !== hostWebContentsId) return;
      onOpenNewTabRef.current(url);
    });

    return () => {
      guest.removeEventListener("did-start-loading", onStartLoading);
      guest.removeEventListener("did-stop-loading", onStopLoading);
      guest.removeEventListener("did-navigate", onNavigate);
      guest.removeEventListener("did-navigate-in-page", onNavigateInPage);
      guest.removeEventListener("page-title-updated", onPageTitleUpdated);
      guest.removeEventListener("page-favicon-updated", onFaviconUpdated);
      guest.removeEventListener("focus", onFocus);
      guest.removeEventListener("blur", onBlur);
      if (getActiveBrowserWebview() === guest) setActiveBrowserWebview(null);
      interactionCoordinator.unregisterWebview(guest);
      unregisterWebview();
      unlistenOpenNewTab();
      container.removeChild(guest);
      webviewRef.current = null;
      setWebview(null);
      setWebContentsId(null);
    };
    // Deliberately empty deps — one webview per tab item for its whole
    // lifetime, navigated imperatively; item.id is a stable mount key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, item.id, syncNavState]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    webview.style.visibility = visible ? "visible" : "hidden";
    interactionCoordinator.setBrowserPaneVisible(tabId, item.id, visible);
    // #region agent log
    dbgLog(
      "BrowserContent:visible",
      "pane visibility",
      { tabId, itemId: item.id, visible },
      "H3",
    );
    // #endregion
    if (!visible) {
      addressInputRef.current?.blur();
      if (getActiveBrowserWebview() === webview) {
        setActiveBrowserWebview(null);
      }
    }
  }, [visible, tabId, item.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;
      const guest = webviewRef.current;
      const browserFocused =
        guest &&
        (getActiveBrowserWebview() === guest || document.activeElement?.closest(".browser-pane-chrome"));
      if (!browserFocused) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        addressInputRef.current?.focus();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "=" && e.key !== "+" && e.key !== "-" && e.key !== "_") return;
      e.preventDefault();
      e.stopPropagation();
      const grow = e.key === "=" || e.key === "+";
      setZoom(zoomFactor + (grow ? ZOOM_STEP : -ZOOM_STEP));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [visible, zoomFactor, setZoom]);

  const navigate = (url: string): void => {
    const normalized = normalizeBrowserNavigationUrl(url, true);
    if (normalized) webviewRef.current?.loadURL(normalized);
  };

  const zoomLabel = `${Math.round(zoomFactor * 100)}%`;

  return (
    <div className="browser-pane-chrome" style={{ pointerEvents: visible ? undefined : "none" }}>
      <div className="pane-header pane-header-browser">
        <div className="browser-nav">
          <BrowserNavButton
            direction="back"
            disabled={!canGoBack}
            active={visible}
            webview={webview}
            webContentsId={webContentsId}
            onNavigate={syncNavState}
          />
          <BrowserNavButton
            direction="forward"
            disabled={!canGoForward}
            active={visible}
            webview={webview}
            webContentsId={webContentsId}
            onNavigate={syncNavState}
          />
          <button type="button" className="browser-nav-btn" title="Reload" onClick={() => webviewRef.current?.reload()}>
            ↻
          </button>
          <div className="browser-zoom-controls">
            <button
              type="button"
              className="browser-nav-btn"
              title="Zoom out"
              disabled={zoomFactor <= ZOOM_MIN}
              onClick={() => setZoom(zoomFactor - ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="browser-zoom-label"
              title="Reset zoom"
              onClick={() => setZoom(1)}
            >
              {zoomLabel}
            </button>
            <button
              type="button"
              className="browser-nav-btn"
              title="Zoom in"
              disabled={zoomFactor >= ZOOM_MAX}
              onClick={() => setZoom(zoomFactor + ZOOM_STEP)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="browser-nav-btn browser-nav-btn-devtools"
            title="Toggle DevTools"
            onClick={() => {
              const wv = webviewRef.current;
              if (!wv) return;
              if (wv.isDevToolsOpened()) wv.closeDevTools();
              else wv.openDevTools();
            }}
          >
            {"</>"}
          </button>
        </div>
        <BrowserAddressBar
          value={addressInput}
          currentUrl={currentUrl}
          onChange={setAddressInput}
          onNavigate={navigate}
          inputRef={addressInputRef}
        />
      </div>
      {loading ? <div className="browser-loading-bar" aria-hidden="true" /> : null}
      <BrowserDownloadsBar webContentsId={webContentsId} />
      <div ref={containerRef} className="browser-content-slot" />
    </div>
  );
}
