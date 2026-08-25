import { useEffect, useState } from "react";
import {
  getBrowserDownloadsForWebview,
  subscribeBrowserDownloads,
  type BrowserDownloadItem,
} from "../browserDownloads";
import { revealItemInDir } from "../electron";

interface Props {
  webContentsId: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function statusLabel(item: BrowserDownloadItem): string {
  if (item.state === "completed") return "Done";
  if (item.state === "cancelled") return "Cancelled";
  if (item.state === "interrupted") return "Failed";
  if (item.totalBytes > 0) {
    const pct = Math.round((item.receivedBytes / item.totalBytes) * 100);
    return `${pct}%`;
  }
  return formatBytes(item.receivedBytes);
}

export function BrowserDownloadsBar({ webContentsId }: Props) {
  const [items, setItems] = useState<BrowserDownloadItem[]>([]);

  useEffect(() => {
    const refresh = () => {
      if (webContentsId === null) {
        setItems([]);
        return;
      }
      setItems(getBrowserDownloadsForWebview(webContentsId));
    };
    refresh();
    return subscribeBrowserDownloads(refresh);
  }, [webContentsId]);

  if (items.length === 0) return null;

  return (
    <div className="browser-downloads-bar" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`browser-download-item browser-download-item--${item.state}`}>
          <div className="browser-download-item-main">
            <span className="browser-download-filename">{item.filename}</span>
            <span className="browser-download-status">{statusLabel(item)}</span>
          </div>
          {item.state === "progressing" && item.totalBytes > 0 ? (
            <div className="browser-download-progress">
              <div
                className="browser-download-progress-fill"
                style={{ width: `${Math.min(100, (item.receivedBytes / item.totalBytes) * 100)}%` }}
              />
            </div>
          ) : null}
          {item.state === "completed" && item.path ? (
            <button
              type="button"
              className="browser-download-reveal"
              onClick={() => revealItemInDir(item.path).catch(console.error)}
            >
              Show in folder
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
