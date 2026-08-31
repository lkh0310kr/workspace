/** Default feeds for the dashboard Newspaper widget (IDEATION: Blog, News). */
export const DASHBOARD_NEWSPAPER_FEEDS = [
  { id: "hn", label: "Hacker News", url: "https://hnrss.org/frontpage" },
  { id: "bbc", label: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
] as const;

/** Seoul — fallback when geolocation is unavailable. */
export const DASHBOARD_DEFAULT_COORDS = { lat: 37.5665, lon: 126.9780 };

export const DASHBOARD_REFRESH_MS = {
  weather: 30 * 60_000,
  economy: 5 * 60_000,
  newspaper: 15 * 60_000,
} as const;
