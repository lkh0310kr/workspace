import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserAddressBar } from "../components/BrowserAddressBar";
import { BrowserNavButton } from "../components/BrowserNavButton";
import { BrowserDownloadsBar } from "../components/BrowserDownloadsBar";
import { normalizeBrowserNavigationUrl, BLANK_URL } from "../browserUrl";
import { recordBrowserVisit } from "../browserHistory";
import { BROWSER_SESSION_PARTITION } from "../browserSessionPartition";
import { onBrowserOpenNewTab } from "../electron";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { setActiveBrowserWebview, getActiveBrowserWebview, registerBrowserWebview } from "../layout/activeBrowserWebview";
import {
  registerPersistentWebview,
  unregisterPersistentWebview,
  moveFocusToRendererBeforeFocusedWebviewHidden,
  moveFocusToRendererBeforeWebviewDetach,
} from "../layout/browserWebviewRegistry";
import type { PaneTabItem } from "../layout/paneTypes";

// The per-page content half of what used to be BrowserPane.tsx — tab-strip
// ownership (open/close/switch pages) moved up to PaneGroup.tsx as part of
// globalizing the tab system, same as EditorContent.tsx. What's still
// genuinely page-specific stays here: the <webview> guest itself and its
// own nav+address bar row.
interface Props {
  tabId: number;
  paneNodeId: string;
  item: PaneTabItem;
  /** Flexlayout pane visible in the active workspace tab. */
  paneVisible: boolean;
  /** This browser chip is the active tab in its pane group. */
  chipActive: boolean;
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

export function BrowserContent({ tabId, paneNodeId, item, paneVisible, chipActive, onUpdate, onOpenNewTab }: Props) {
  const chipShown = paneVisible && chipActive;
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [addressInput, setAddressInput] = useState(item.url ?? DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(item.url ?? DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [webContentsId, setWebContentsId] = useState<number | null>(null);
  const [zoomFactor, setZoomFactor] = useState(item.zoomFactor ?? 1);
  const [rendererGone, setRendererGone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    // Start hidden — reconcile() enables only the focused pane's guest.
    // Without this, a freshly mounted webview's native layer sits above DOM
    // (tab strips, popovers, workspace rail) until the next reconcile tick.
    guest.style.display = "none";
    guest.style.pointerEvents = "none";
    container.appendChild(guest);
    webviewRef.current = guest;
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
    // Why (Orca parity — host-guest/browser-page-guest-recovery.ts): a
    // crashed/OOM-killed guest renderer fires render-process-gone and goes
    // blank with no further events, so the crash needs its own listener
    // rather than falling through did-stop-loading. Workspace has no
    // main-process guest registry to validate against or replace a guest
    // through, so this is the display+reload half only, not Orca's full
    // recovery/validation state machine.
    const onRendererGone = (): void => setRendererGone(true);
    const onDomReady = (): void => {
      setRendererGone(false);
      setLoadError(null);
    };
    const onFailLoad = (e: Electron.DidFailLoadEvent): void => {
      if (!e.validatedURL?.startsWith("workspace-engine:")) return;
      setLoadError(
        "Engine bundle not found. For world-engine.json projects use TreeView → Open in World Engine. For Godot, use Export Godot (Web) & Open.",
      );
    };

    guest.addEventListener("did-start-loading", onStartLoading);
    guest.addEventListener("did-stop-loading", onStopLoading);
    guest.addEventListener("did-navigate", onNavigate);
    guest.addEventListener("did-navigate-in-page", onNavigateInPage);
    guest.addEventListener("page-title-updated", onPageTitleUpdated);
    guest.addEventListener("page-favicon-updated", onFaviconUpdated);
    guest.addEventListener("render-process-gone", onRendererGone);
    guest.addEventListener("dom-ready", onDomReady);
    guest.addEventListener("did-fail-load", onFailLoad);

    const unregisterWebview = registerBrowserWebview(guest);
    registerPersistentWebview(item.id, guest);
    interactionCoordinator.registerWebview(guest, {
      workspaceTabId: tabId,
      paneNodeId,
      paneTabItemId: item.id,
      initialPaneVisible: paneVisible,
      initialChipActive: chipActive,
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
      guest.removeEventListener("render-process-gone", onRendererGone);
      guest.removeEventListener("dom-ready", onDomReady);
      guest.removeEventListener("did-fail-load", onFailLoad);
      guest.removeEventListener("focus", onFocus);
      guest.removeEventListener("blur", onBlur);
      if (getActiveBrowserWebview() === guest) setActiveBrowserWebview(null);
      interactionCoordinator.unregisterWebview(guest);
      unregisterWebview();
      unregisterPersistentWebview(item.id);
      unlistenOpenNewTab();
      moveFocusToRendererBeforeWebviewDetach(guest);
      container.removeChild(guest);
      webviewRef.current = null;
      setWebContentsId(null);
    };
    // Deliberately empty deps — one webview per tab item for its whole
    // lifetime, navigated imperatively; item.id is a stable mount key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, paneNodeId, item.id, syncNavState]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    webview.style.visibility = chipShown ? "visible" : "hidden";
    interactionCoordinator.setBrowserPaneVisible(tabId, item.id, paneVisible);
    interactionCoordinator.setBrowserChipActive(tabId, item.id, chipActive);
    if (!chipShown) {
      addressInputRef.current?.blur();
      moveFocusToRendererBeforeFocusedWebviewHidden();
      if (getActiveBrowserWebview() === webview) {
        setActiveBrowserWebview(null);
      }
    }
  }, [paneVisible, chipActive, chipShown, tabId, item.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!chipShown) return;
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
  }, [chipShown, zoomFactor, setZoom]);

  const navigate = (url: string): void => {
    const normalized = normalizeBrowserNavigationUrl(url, true);
    if (normalized) webviewRef.current?.loadURL(normalized);
  };

  const zoomLabel = `${Math.round(zoomFactor * 100)}%`;

  return (
    <div className="browser-pane-chrome" style={{ pointerEvents: chipShown ? undefined : "none" }}>
      <div className="pane-header pane-header-browser">
        <div className="browser-nav">
          <BrowserNavButton
            direction="back"
            disabled={!canGoBack}
            active={chipShown}
            webContentsId={webContentsId}
            onNavigate={syncNavState}
          />
          <BrowserNavButton
            direction="forward"
            disabled={!canGoForward}
            active={chipShown}
            webContentsId={webContentsId}
            onNavigate={syncNavState}
          />
          <button
            type="button"
            className="browser-nav-btn"
            title={loading ? "Stop" : "Reload"}
            onClick={() => {
              const wv = webviewRef.current;
              if (!wv) return;
              if (loading) wv.stop();
              else wv.reload();
            }}
          >
            {loading ? "×" : "↻"}
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
      <div className="browser-content-slot-wrap">
        {/* containerRef stays a pure imperative host for the <webview> —
            keeping it free of React-rendered children avoids React's
            reconciliation fighting the guest element it doesn't know
            about. The crash banner is a positioned sibling instead. */}
        <div ref={containerRef} className="browser-content-slot" />
        {rendererGone && (
          <div className="browser-crash-banner">
            <span>This page crashed.</span>
            <button
              type="button"
              className="browser-crash-reload"
              onClick={() => webviewRef.current?.reload()}
            >
              Reload
            </button>
          </div>
        )}
        {loadError && !rendererGone && (
          <div className="browser-crash-banner">
            <span>{loadError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
