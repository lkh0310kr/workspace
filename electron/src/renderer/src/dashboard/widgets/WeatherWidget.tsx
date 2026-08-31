import { useCallback, useEffect, useState } from "react";
import { fetchDashboardWeather, type DashboardWeather } from "../../electron";
import { DASHBOARD_DEFAULT_COORDS, DASHBOARD_REFRESH_MS } from "../dashboardConfig";
import { DashboardWidget } from "../DashboardWidget";

function normalizeCoords(lat: number, lon: number): { lat: number; lon: number } {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return DASHBOARD_DEFAULT_COORDS;
  }
  return { lat, lon };
}

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code === 45 || code === 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

export function WeatherWidget(): React.JSX.Element {
  const [weather, setWeather] = useState<DashboardWeather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const coords = await new Promise<{ lat: number; lon: number }>((resolve) => {
        if (!navigator.geolocation) {
          resolve(DASHBOARD_DEFAULT_COORDS);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve(
              normalizeCoords(pos.coords.latitude, pos.coords.longitude),
            ),
          () => resolve(DASHBOARD_DEFAULT_COORDS),
          { timeout: 4000, maximumAge: 60 * 60_000 },
        );
      });
      setWeather(await fetchDashboardWeather(coords.lat, coords.lon));
    } catch {
      setError("날씨를 불러오지 못했습니다");
      setWeather(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), DASHBOARD_REFRESH_MS.weather);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <DashboardWidget
      className="dashboard-widget--brief"
      ariaLabel="날씨"
      onRefresh={() => void load()}
    >
      {loading && !weather ? (
        <p className="dashboard-muted">불러오는 중…</p>
      ) : error ? (
        <p className="dashboard-muted">{error}</p>
      ) : weather ? (
        <div className="dashboard-weather">
          <div className="dashboard-weather-main">
            <span className="dashboard-weather-icon" aria-hidden="true">
              {weatherEmoji(weather.weatherCode)}
            </span>
            <div className="dashboard-weather-reading">
              <span className="dashboard-weather-temp">{Math.round(weather.temperatureC)}°C</span>
              <span className="dashboard-weather-label">{weather.label}</span>
            </div>
          </div>
          <div className="dashboard-weather-stats">
            <span>습도 {weather.humidity}%</span>
            <span>풍속 {Math.round(weather.windKmh)} km/h</span>
          </div>
        </div>
      ) : null}
    </DashboardWidget>
  );
}
