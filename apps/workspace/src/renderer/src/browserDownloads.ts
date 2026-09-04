export interface BrowserDownloadItem {
  id: string;
  hostWebContentsId: number;
  filename: string;
  url: string;
  path: string;
  receivedBytes: number;
  totalBytes: number;
  state: "progressing" | "interrupted" | "completed" | "cancelled";
  updatedAt: number;
}

type Listener = () => void;

const downloads = new Map<string, BrowserDownloadItem>();
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeBrowserDownloads(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowserDownloads(): BrowserDownloadItem[] {
  return [...downloads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getBrowserDownloadsForWebview(webContentsId: number): BrowserDownloadItem[] {
  return getBrowserDownloads().filter((d) => d.hostWebContentsId === webContentsId);
}

export function applyBrowserDownloadEvent(payload: {
  id: string;
  hostWebContentsId: number;
  phase: "started" | "updated" | "done";
  filename?: string;
  url?: string;
  path?: string;
  receivedBytes?: number;
  totalBytes?: number;
  state?: BrowserDownloadItem["state"];
}): void {
  const now = Date.now();
  if (payload.phase === "started") {
    downloads.set(payload.id, {
      id: payload.id,
      hostWebContentsId: payload.hostWebContentsId,
      filename: payload.filename ?? "download",
      url: payload.url ?? "",
      path: payload.path ?? "",
      receivedBytes: payload.receivedBytes ?? 0,
      totalBytes: payload.totalBytes ?? 0,
      state: payload.state ?? "progressing",
      updatedAt: now,
    });
    notify();
    return;
  }

  const existing = downloads.get(payload.id);
  if (!existing) return;

  if (payload.phase === "updated") {
    existing.receivedBytes = payload.receivedBytes ?? existing.receivedBytes;
    existing.totalBytes = payload.totalBytes ?? existing.totalBytes;
    existing.state = payload.state ?? existing.state;
    existing.updatedAt = now;
    notify();
    return;
  }

  existing.path = payload.path ?? existing.path;
  existing.state = payload.state ?? "completed";
  existing.updatedAt = now;
  notify();

  // Drop completed/cancelled entries after a short while so the bar clears.
  if (existing.state === "completed" || existing.state === "cancelled") {
    setTimeout(() => {
      downloads.delete(payload.id);
      notify();
    }, 8000);
  }
}

export function installBrowserDownloadRelay(): () => void {
  return window.api.browser.onDownloadEvent((payload) => applyBrowserDownloadEvent(payload));
}
