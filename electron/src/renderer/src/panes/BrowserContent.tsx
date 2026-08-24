import { useEffect, useRef, useState } from "react";
import { BrowserAddressBar } from "../components/BrowserAddressBar";
import { normalizeBrowserNavigationUrl, BLANK_URL } from "../browserUrl";
import { recordBrowserVisit } from "../browserHistory";
import { BROWSER_SESSION_PARTITION } from "../browserSessionPartition";
import { onBrowserOpenNewTab } from "../electron";
import { setActiveBrowserWebview, getActiveBrowserWebview } from "../layout/activeBrowserWebview";
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

export function BrowserContent({ tabId, item, visible, onUpdate, onOpenNewTab }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [addressInput, setAddressInput] = useState(item.url ?? DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(item.url ?? DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onOpenNewTabRef = useRef(onOpenNewTab);
  onOpenNewTabRef.current = onOpenNewTab;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const webview = document.createElement("webview") as Electron.WebviewTag;
    webview.setAttribute("partition", BROWSER_SESSION_PARTITION);
    webview.setAttribute("src", normalizeBrowserNavigationUrl(item.url ?? DEFAULT_URL, false) ?? BLANK_URL);
    webview.setAttribute("allowpopups", "");
    webview.dataset.tabItemId = item.id;
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "none";
    webview.style.background = "#ffffff";
    container.appendChild(webview);
    webviewRef.current = webview;

    const syncNavState = (): void => {
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };
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
        recordBrowserVisit(webview.getURL(), e.title);
      } catch {
        // webview can be mid-teardown when this fires.
      }
    };

    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate);
    webview.addEventListener("did-navigate-in-page", onNavigateInPage);
    webview.addEventListener("page-title-updated", onPageTitleUpdated);

    // Cmd+R/Cmd+Shift+R (App.tsx) needs to know which webview actually has
    // keyboard focus right now, not just which one is merely "visible" —
    // a pane can be showing a browser tab while the user's actual focus is
    // in a sibling editor/terminal pane split next to it. <webview> is a
    // real HTMLElement and does dispatch focus/blur when the guest's own
    // focus state changes, so this tracks the true focused webview instead
    // of the previous "last one to become visible" approximation.
    const onFocus = (): void => setActiveBrowserWebview(webview);
    const onBlur = (): void => {
      if (getActiveBrowserWebview() === webview) setActiveBrowserWebview(null);
    };
    webview.addEventListener("focus", onFocus);
    webview.addEventListener("blur", onBlur);

    // target="_blank"/window.open() in the guest page — main/index.ts's
    // web-contents-created handler denies the native window this would
    // otherwise open (BrowserPane.tsx sets allowpopups) and forwards the
    // URL via this IPC instead, identified by webContentsId since a guest
    // isn't necessarily attached (and thus doesn't have a real id) the
    // instant this effect runs.
    const unlistenOpenNewTab = onBrowserOpenNewTab(({ hostWebContentsId, url }) => {
      let myId: number;
      try {
        myId = webview.getWebContentsId();
      } catch {
        return;
      }
      if (myId !== hostWebContentsId) return;
      onOpenNewTabRef.current(url);
    });

    return () => {
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage);
      webview.removeEventListener("page-title-updated", onPageTitleUpdated);
      webview.removeEventListener("focus", onFocus);
      webview.removeEventListener("blur", onBlur);
      if (getActiveBrowserWebview() === webview) setActiveBrowserWebview(null);
      unlistenOpenNewTab();
      container.removeChild(webview);
      webviewRef.current = null;
    };
    // Deliberately empty deps — one webview per tab item for its whole
    // lifetime, navigated imperatively; item.id is a stable mount key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, item.id]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    webview.style.visibility = visible ? "visible" : "hidden";
    if (visible) {
      // Mirrors TerminalPane.tsx/EditorContent's own termRef/view.focus()
      // on their "active" transition — without this, switching to a
      // browser tab (without also manually clicking into its page) never
      // moved real focus there, so Cmd+R had nothing to go on until the
      // user happened to click inside the guest content.
      webview.focus();
    } else if (getActiveBrowserWebview() === webview) {
      // A tab switching away doesn't get a real blur event on its own
      // (still mounted, just hidden), so clear it explicitly here too.
      setActiveBrowserWebview(null);
    }
  }, [visible]);

  // Cmd+L / Ctrl+L: jump to and select this page's address bar — only
  // while it's the visible/active tab.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        addressInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  const navigate = (url: string): void => {
    const normalized = normalizeBrowserNavigationUrl(url, true);
    if (normalized) webviewRef.current?.loadURL(normalized);
  };

  return (
    <div className="browser-pane-chrome">
      <div className="pane-header pane-header-browser">
        <div className="browser-nav">
          <button
            type="button"
            className="browser-nav-btn"
            title="Back"
            disabled={!canGoBack}
            onClick={() => webviewRef.current?.goBack()}
          >
            ‹
          </button>
          <button
            type="button"
            className="browser-nav-btn"
            title="Forward"
            disabled={!canGoForward}
            onClick={() => webviewRef.current?.goForward()}
          >
            ›
          </button>
          <button type="button" className="browser-nav-btn" title="Reload" onClick={() => webviewRef.current?.reload()}>
            ↻
          </button>
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
      <div ref={containerRef} className="browser-content-slot" />
    </div>
  );
}
