import { describe, expect, it, vi } from "vitest";
import {
  fetchDashboardEconomy,
  fetchDashboardWeather,
  normalizeDashboardCoords,
} from "./dashboardData";

vi.mock("./dashboardHttp", () => ({
  fetchDashboardJson: vi.fn(async (url: string) => {
    if (url.includes("open-meteo.com")) {
      return {
        current: {
          temperature_2m: 12.5,
          relative_humidity_2m: 55,
          weather_code: 0,
          wind_speed_10m: 8,
        },
      };
    }
    if (url.includes("coingecko.com")) {
      return {
        bitcoin: { usd: 50_000, usd_24h_change: 1.2 },
        ethereum: { usd: 3_000, usd_24h_change: -0.5 },
      };
    }
    if (url.includes("frankfurter.app")) {
      return { rates: { KRW: 1350, EUR: 0.92, JPY: 150 } };
    }
    throw new Error(`unexpected dashboard fetch in test: ${url}`);
  }),
}));

describe("normalizeDashboardCoords", () => {
  it("falls back to Seoul for invalid coordinates", () => {
    expect(normalizeDashboardCoords(Number.NaN, 126)).toEqual({ lat: 37.5665, lon: 126.978 });
    expect(normalizeDashboardCoords(91, 0)).toEqual({ lat: 37.5665, lon: 126.978 });
  });
});

describe("fetchDashboardWeather", () => {
  it("returns current conditions for a fixed coordinate", async () => {
    const weather = await fetchDashboardWeather(37.5665, 126.978);
    expect(weather.temperatureC).toBe(12.5);
    expect(weather.humidity).toBe(55);
    expect(weather.label).toBe("맑음");
  });

  it("recovers from invalid coordinates via fallback", async () => {
    const weather = await fetchDashboardWeather(Number.NaN, Number.NaN);
    expect(weather.temperatureC).toBe(12.5);
  });
});

describe("fetchDashboardEconomy", () => {
  it("returns market quotes with recognizable symbols", async () => {
    const quotes = await fetchDashboardEconomy();
    expect(quotes.length).toBeGreaterThan(0);
    const ids = new Set(quotes.map((q) => q.id));
    expect(ids.has("btc") || ids.has("usdkrw")).toBe(true);
    for (const quote of quotes) {
      expect(quote.label.length).toBeGreaterThan(0);
      expect(quote.value.length).toBeGreaterThan(0);
    }
  });
});
