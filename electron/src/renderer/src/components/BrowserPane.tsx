import { useEffect, useRef, useState } from "react";

// Minimal first pass at Orca's browser-pane approach: a real Electron
// <webview> guest (not BrowserView/WebContentsView), created imperatively
// via document.createElement rather than JSX — Orca does the same (see
// ref-proj/orca's browser-page-webview.ts ensureBrowserPageWebview) to
// avoid React's reconciler tearing down and recreating the guest (which
// would reload the page) on every re-render. Not porting Orca's full
// persistent-webview registry/lifecycle system yet (parent-drift repair,
// partition-based session isolation, paint retention across tab
// switches) — this is enough to prove <webview> avoids the z-order/
// async-detach races the Tauri native-child-webview version had.
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(:\d+)?/.test(trimmed) || /\.[a-z]{2,}$/i.test(trimmed.split("/")[0])) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function BrowserPane(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [addressInput, setAddressInput] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const webview = document.createElement("webview") as Electron.WebviewTag;
    webview.setAttribute("src", normalizeUrl(addressInput));
    webview.setAttribute("allowpopups", "");
    webview.style.display = "flex";
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "none";
    webview.style.background = "#ffffff";
    container.appendChild(webview);
    webviewRef.current = webview;

    const onStartLoading = (): void => setLoading(true);
    const onStopLoading = (): void => {
      setLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };
    const onNavigate = (e: Electron.DidNavigateEvent): void => setAddressInput(e.url);
    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => setAddressInput(e.url);

    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate);
    webview.addEventListener("did-navigate-in-page", onNavigateInPage);

    return () => {
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage);
      container.removeChild(webview);
      webviewRef.current = null;
    };
    // Deliberately empty deps — the webview is created once and navigated
    // via imperative calls below, not recreated on every address change
    // (that would reload/lose history on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (url: string): void => {
    webviewRef.current?.loadURL(normalizeUrl(url));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          background: "#2a2a2a",
          borderBottom: "1px solid #3a3a3a",
        }}
      >
        <button type="button" disabled={!canGoBack} onClick={() => webviewRef.current?.goBack()}>
          ←
        </button>
        <button type="button" disabled={!canGoForward} onClick={() => webviewRef.current?.goForward()}>
          →
        </button>
        <button type="button" onClick={() => webviewRef.current?.reload()}>
          {loading ? "×" : "⟳"}
        </button>
        <input
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(addressInput);
          }}
          style={{ flex: 1, padding: "4px 8px" }}
        />
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
