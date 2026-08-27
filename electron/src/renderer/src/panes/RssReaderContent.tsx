import { useEffect, useRef, useState } from "react";
import { fetchFeed, type FeedResult } from "../electron";
import type { PaneTabItem } from "../layout/paneTypes";

// RSS Reader pane — one feed URL per tab (like BrowserContent's `url`),
// not a multi-feed subscription manager. No article cache: refetches live
// whenever the feed URL is (re)set. Clicking an article opens it as a new
// browser tab rather than an inline reader — sanitizing arbitrary article
// HTML (embedded scripts/styles, tracking pixels, relative-URL fixups) is
// a much bigger scope than "show a feed's item list," and the browser tab
// reuses an already-battle-tested renderer instead.
interface Props {
  item: PaneTabItem;
  onUpdate: (patch: Partial<PaneTabItem>) => void;
  onOpenArticle: (link: string) => void;
}

export function RssReaderContent({ item, onUpdate, onOpenArticle }: Props) {
  const [urlDraft, setUrlDraft] = useState("");
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Refetching the same feedUrl (the refresh button) wouldn't otherwise
  // change the load effect's dependency, so it's paired with this local
  // counter purely to force a re-run.
  const [refreshKey, setRefreshKey] = useState(0);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    setFeed(null);
    setError(null);
    if (!item.feedUrl) return;
    let cancelled = false;
    setLoading(true);
    fetchFeed(item.feedUrl)
      .then((result) => {
        if (cancelled) return;
        setFeed(result);
        setLoading(false);
        if (result.title && result.title !== item.title) {
          onUpdateRef.current({ title: result.title });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "failed to load feed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.feedUrl, refreshKey]);

  if (!item.feedUrl) {
    return (
      <div className="rss-reader">
        <form
          className="rss-reader-url-form"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = urlDraft.trim();
            if (trimmed) onUpdate({ feedUrl: trimmed });
          }}
        >
          <input
            className="rss-reader-url-input"
            placeholder="Feed URL (RSS or Atom)"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            autoFocus
          />
          <button type="submit" className="rss-reader-url-submit" disabled={!urlDraft.trim()}>
            Subscribe
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rss-reader">
      <div className="rss-reader-header">
        <span className="rss-reader-title">{feed?.title ?? item.title ?? item.feedUrl}</span>
        <button
          type="button"
          className="rss-reader-refresh"
          title="Refresh"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          ↻
        </button>
      </div>
      {loading ? (
        <div className="rss-reader-empty">Loading…</div>
      ) : error ? (
        <div className="rss-reader-empty">{error}</div>
      ) : !feed || feed.items.length === 0 ? (
        <div className="rss-reader-empty">No items</div>
      ) : (
        <div className="rss-reader-items">
          {feed.items.map((article, i) => (
            <div
              key={article.link || i}
              className="rss-reader-item"
              onClick={() => article.link && onOpenArticle(article.link)}
            >
              <div className="rss-reader-item-title">{article.title}</div>
              <div className="rss-reader-item-meta">
                {article.pubDate ? new Date(article.pubDate).toLocaleString() : null}
              </div>
              {article.contentSnippet && (
                <div className="rss-reader-item-snippet">{article.contentSnippet}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
