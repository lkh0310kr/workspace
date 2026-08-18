import { useBrowserSession } from "./BrowserSession";

export function BrowserToolbar() {
  const { url, setUrl, navigate, back, forward, reload, toggleDevtools, loading } =
    useBrowserSession();

  return (
    <>
      <div className="browser-nav">
        <button type="button" className="browser-nav-btn" title="Back" onClick={back}>
          ‹
        </button>
        <button type="button" className="browser-nav-btn" title="Forward" onClick={forward}>
          ›
        </button>
        <button type="button" className="browser-nav-btn" title="Reload" onClick={reload}>
          ↻
        </button>
        <button
          type="button"
          className="browser-nav-btn browser-nav-btn-devtools"
          title="Toggle DevTools (also: right-click the page → Inspect Element)"
          onClick={toggleDevtools}
        >
          {"</>"}
        </button>
      </div>
      <input
        className="browser-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && navigate()}
        placeholder="https://..."
        spellCheck={false}
      />
      {loading ? <div className="browser-loading-bar" aria-hidden="true" /> : null}
    </>
  );
}
