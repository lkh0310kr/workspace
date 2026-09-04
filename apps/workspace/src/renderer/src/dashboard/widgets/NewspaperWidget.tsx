import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeed, type FeedItem } from "../../electron";
import { DASHBOARD_NEWSPAPER_FEEDS, DASHBOARD_REFRESH_MS } from "../dashboardConfig";
import { DashboardWidget } from "../DashboardWidget";

export type NewspaperHeadline = FeedItem & {
  feedId: string;
  feedLabel: string;
};

type Props = {
  onHeadlinesChange?: (headlines: NewspaperHeadline[]) => void;
};

export function NewspaperWidget({ onHeadlinesChange }: Props): React.JSX.Element {
  const [headlines, setHeadlines] = useState<NewspaperHeadline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const onHeadlinesChangeRef = useRef(onHeadlinesChange);
  onHeadlinesChangeRef.current = onHeadlinesChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        DASHBOARD_NEWSPAPER_FEEDS.map(async (feed) => {
          const result = await fetchFeed(feed.url);
          return result.items.slice(0, 4).map((item) => ({
            ...item,
            feedId: feed.id,
            feedLabel: feed.label,
          }));
        }),
      );
      const merged = results
        .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
        .slice(0, 10);
      setHeadlines(merged);
      onHeadlinesChangeRef.current?.(merged);
      if (merged.length === 0) {
        setError("뉴스를 불러오지 못했습니다");
      }
    } catch {
      setError("뉴스를 불러오지 못했습니다");
      setHeadlines([]);
      onHeadlinesChangeRef.current?.([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), DASHBOARD_REFRESH_MS.newspaper);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <DashboardWidget ariaLabel="뉴스" onRefresh={() => void load()}>
      {loading && headlines.length === 0 ? (
        <p className="dashboard-muted">불러오는 중…</p>
      ) : error && headlines.length === 0 ? (
        <p className="dashboard-muted">{error}</p>
      ) : (
        <ul className="dashboard-headline-list">
          {headlines.map((item, index) => (
            <li key={`${item.feedId}-${item.link}-${index}`} className="dashboard-headline-item">
              <div className="dashboard-headline-main">
                <span className="dashboard-headline-source">{item.feedLabel}</span>
                <span className="dashboard-headline-title">{item.title}</span>
              </div>
              {item.pubDate ? (
                <span className="dashboard-headline-date">
                  {new Date(item.pubDate).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
