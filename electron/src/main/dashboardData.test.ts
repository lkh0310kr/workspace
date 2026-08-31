import { describe, expect, it } from "vitest";
import {
  fetchDashboardEconomy,
  fetchDashboardWeather,
  normalizeDashboardCoords,
} from "./dashboardData";

describe("normalizeDashboardCoords", () => {
  it("falls back to Seoul for invalid coordinates", () => {
    expect(normalizeDashboardCoords(Number.NaN, 126)).toEqual({ lat: 37.5665, lon: 126.978 });
    expect(normalizeDashboardCoords(91, 0)).toEqual({ lat: 37.5665, lon: 126.978 });
  });
});

describe("fetchDashboardWeather", () => {
  it("returns current conditions for a fixed coordinate", async () => {
    const weather = await fetchDashboardWeather(37.5665, 126.978);
    expect(weather.temperatureC).toBeTypeOf("number");
    expect(weather.humidity).toBeGreaterThanOrEqual(0);
    expect(weather.label.length).toBeGreaterThan(0);
  }, 15_000);

  it("recovers from invalid coordinates via fallback", async () => {
    const weather = await fetchDashboardWeather(Number.NaN, Number.NaN);
    expect(weather.temperatureC).toBeTypeOf("number");
  }, 15_000);
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
  }, 20_000);
});
