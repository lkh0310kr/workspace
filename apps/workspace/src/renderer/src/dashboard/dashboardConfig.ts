/** Seoul — fallback when geolocation is unavailable. */
export const DASHBOARD_DEFAULT_COORDS = { lat: 37.5665, lon: 126.9780 };

export const DASHBOARD_REFRESH_MS = {
  weather: 30 * 60_000,
  economy: 5 * 60_000,
} as const;
