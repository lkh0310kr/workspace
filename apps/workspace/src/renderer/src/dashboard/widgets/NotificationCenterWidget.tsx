import { useEffect, useMemo, useState } from "react";
import {
  getBrowserDownloads,
  subscribeBrowserDownloads,
  type BrowserDownloadItem,
} from "../../browserDownloads";
import { DashboardWidget } from "../DashboardWidget";
import type { NewspaperHeadline } from "./NewspaperWidget";

type NotificationItem = {
  id: string;
  primary: string;
  secondary: string;
  at: number;
};

type Props = {
  feedHeadlines: NewspaperHeadline[];
};

function formatRelativeTime(at: number): string {
  const delta = Date.now() - at;
  if (delta < 60_000) return "방금";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}분 전`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}시간 전`;
  return new Date(at).toLocaleDateString();
}

function downloadNotification(item: BrowserDownloadItem): NotificationItem {
  const done = item.state === "completed";
  return {
    id: `download-${item.id}`,
    primary: item.filename,
    secondary: done ? "다운로드 완료" : "다운로드 중",
    at: item.updatedAt,
  };
}

function feedNotification(item: NewspaperHeadline, index: number): NotificationItem {
  return {
    id: `feed-${item.feedId}-${index}`,
    primary: item.title,
    secondary: item.feedLabel,
    at: item.pubDate ? new Date(item.pubDate).getTime() : Date.now() - index,
  };
}

export function NotificationCenterWidget({ feedHeadlines }: Props): React.JSX.Element {
  const [downloads, setDownloads] = useState(() => getBrowserDownloads());

  useEffect(() => subscribeBrowserDownloads(() => setDownloads(getBrowserDownloads())), []);

  const notifications = useMemo(() => {
    const items: NotificationItem[] = [
      ...downloads.slice(0, 5).map(downloadNotification),
      ...feedHeadlines.slice(0, 4).map(feedNotification),
    ];
    return items.sort((a, b) => b.at - a.at).slice(0, 8);
  }, [downloads, feedHeadlines]);

  return (
    <DashboardWidget ariaLabel="최근 알림">
      {notifications.length === 0 ? (
        <p className="dashboard-muted">최근 알림 없음</p>
      ) : (
        <ul className="dashboard-notification-list">
          {notifications.map((item) => (
            <li key={item.id} className="dashboard-notification-item">
              <div className="dashboard-notification-text">
                <span className="dashboard-notification-primary">{item.primary}</span>
                <span className="dashboard-notification-secondary">{item.secondary}</span>
              </div>
              <span className="dashboard-notification-time">{formatRelativeTime(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
