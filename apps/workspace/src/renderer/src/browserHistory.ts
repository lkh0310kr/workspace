// Lightweight visited-URL history for the address bar's autocomplete
// dropdown — the piece of "실제 브라우저처럼" (like a real browser) that
// Orca gets from a Zustand store synced across its whole app; this app has
// no such store, so it's a small standalone localStorage-backed module
// instead. Shared across every BrowserPane instance (module-level cache +
// one storage key), matching how a real browser has one history regardless
// of how many windows/tabs are open.

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  lastVisitedAt: number;
  visitCount: number;
}

const STORAGE_KEY = "workspace.browserHistory";
const MAX_ENTRIES = 500;

let cache: BrowserHistoryEntry[] | null = null;

function load(): BrowserHistoryEntry[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as BrowserHistoryEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache ?? []));
  } catch {
    // Best-effort — a full/unavailable localStorage just means no
    // autocomplete history, not a broken browser pane.
  }
}

function isHistoryEligible(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function getBrowserHistory(): readonly BrowserHistoryEntry[] {
  return load();
}

export function recordBrowserVisit(url: string, title: string): void {
  if (!isHistoryEligible(url)) return;
  const entries = load();
  const existing = entries.find((e) => e.url === url);
  if (existing) {
    existing.title = title || existing.title;
    existing.lastVisitedAt = Date.now();
    existing.visitCount += 1;
  } else {
    entries.push({ url, title: title || url, lastVisitedAt: Date.now(), visitCount: 1 });
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => a.lastVisitedAt - b.lastVisitedAt);
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
  }
  save();
}
