import { useCefSession } from "./CefSession";

export function CefToolbar() {
  const { url, setUrl, navigate, back, forward, reload, progress, canGoBack, canGoForward } =
    useCefSession();

  return (
    <>
      <div className="browser-nav">
        <button
          type="button"
          className="browser-nav-btn"
          title="Back"
          onClick={back}
          disabled={!canGoBack}
        >
          ‹
        </button>
        <button
          type="button"
          className="browser-nav-btn"
          title="Forward"
          onClick={forward}
          disabled={!canGoForward}
        >
          ›
        </button>
        <button type="button" className="browser-nav-btn" title="Reload" onClick={reload}>
          ↻
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
      {progress !== null ? (
        <div
          className="cef-loading-bar"
          style={{ width: `${Math.round(progress * 100)}%` }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
