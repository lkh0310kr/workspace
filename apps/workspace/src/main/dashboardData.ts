import { fetchDashboardJson } from "./dashboardHttp";

export type DashboardWeather = {
  temperatureC: number;
  weatherCode: number;
  humidity: number;
  windKmh: number;
  label: string;
};

export type EconomyQuote = {
  id: string;
  label: string;
  value: string;
  change?: string;
  changeUp?: boolean;
};

export const DASHBOARD_DEFAULT_COORDS = { lat: 37.5665, lon: 126.978 };

const WEATHER_LABELS: Record<number, string> = {
  0: "맑음",
  1: "대체로 맑음",
  2: "구름 조금",
  3: "흐림",
  45: "안개",
  48: "안개",
  51: "이슬비",
  53: "이슬비",
  55: "이슬비",
  61: "비",
  63: "비",
  65: "폭우",
  71: "눈",
  73: "눈",
  75: "폭설",
  80: "소나기",
  81: "소나기",
  82: "강한 소나기",
  95: "뇌우",
};

function weatherLabel(code: number): string {
  return WEATHER_LABELS[code] ?? "알 수 없음";
}

function formatUsd(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatPercent(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

export function normalizeDashboardCoords(
  lat: number,
  lon: number,
): { lat: number; lon: number } {
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

async function fetchWeatherAt(lat: number, lon: number): Promise<DashboardWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");

  const data = await fetchDashboardJson<{
    current?: {
      temperature_2m: number;
      relative_humidity_2m: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    error?: boolean;
  }>(url.toString());

  if (!data.current) {
    throw new Error("weather response missing current");
  }

  const code = data.current.weather_code;
  return {
    temperatureC: data.current.temperature_2m,
    weatherCode: code,
    humidity: data.current.relative_humidity_2m,
    windKmh: data.current.wind_speed_10m,
    label: weatherLabel(code),
  };
}

export async function fetchDashboardWeather(lat: number, lon: number): Promise<DashboardWeather> {
  const coords = normalizeDashboardCoords(lat, lon);
  try {
    return await fetchWeatherAt(coords.lat, coords.lon);
  } catch (firstError) {
    const fallback = DASHBOARD_DEFAULT_COORDS;
    if (coords.lat === fallback.lat && coords.lon === fallback.lon) {
      throw firstError;
    }
    return fetchWeatherAt(fallback.lat, fallback.lon);
  }
}

async function fetchCryptoQuotes(): Promise<EconomyQuote[]> {
  try {
    const crypto = await fetchDashboardJson<{
      bitcoin?: { usd?: number; usd_24h_change?: number };
      ethereum?: { usd?: number; usd_24h_change?: number };
    }>(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
    );

    const quotes: EconomyQuote[] = [];
    const btc = crypto.bitcoin;
    if (btc?.usd != null) {
      const change = btc.usd_24h_change;
      quotes.push({
        id: "btc",
        label: "BTC",
        value: formatUsd(btc.usd, 0),
        change: change != null ? formatPercent(change) : undefined,
        changeUp: change != null ? change >= 0 : undefined,
      });
    }
    const eth = crypto.ethereum;
    if (eth?.usd != null) {
      const change = eth.usd_24h_change;
      quotes.push({
        id: "eth",
        label: "ETH",
        value: formatUsd(eth.usd, 0),
        change: change != null ? formatPercent(change) : undefined,
        changeUp: change != null ? change >= 0 : undefined,
      });
    }
    if (quotes.length > 0) return quotes;
  } catch {
    /* CoinGecko rate limits are common — fall back to Coinbase spot. */
  }

  const [btcSpot, ethSpot] = await Promise.allSettled([
    fetchDashboardJson<{ data: { amount: string } }>(
      "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    ),
    fetchDashboardJson<{ data: { amount: string } }>(
      "https://api.coinbase.com/v2/prices/ETH-USD/spot",
    ),
  ]);

  const quotes: EconomyQuote[] = [];
  if (btcSpot.status === "fulfilled") {
    const amount = Number(btcSpot.value.data.amount);
    if (Number.isFinite(amount)) {
      quotes.push({ id: "btc", label: "BTC", value: formatUsd(amount, 0) });
    }
  }
  if (ethSpot.status === "fulfilled") {
    const amount = Number(ethSpot.value.data.amount);
    if (Number.isFinite(amount)) {
      quotes.push({ id: "eth", label: "ETH", value: formatUsd(amount, 0) });
    }
  }
  return quotes;
}

async function fetchFxQuotes(): Promise<EconomyQuote[]> {
  const quotes: EconomyQuote[] = [];

  try {
    const fx = await fetchDashboardJson<{ rates: Record<string, number> }>(
      "https://api.frankfurter.app/latest?from=USD&to=KRW,EUR,JPY",
    );
    const krw = fx.rates.KRW;
    if (krw != null) {
      quotes.push({ id: "usdkrw", label: "USD/KRW", value: `₩${formatNumber(krw, 0)}` });
    }
    const eur = fx.rates.EUR;
    if (eur != null) {
      quotes.push({ id: "eurusd", label: "EUR/USD", value: formatNumber(1 / eur, 4) });
    }
    const jpy = fx.rates.JPY;
    if (jpy != null) {
      quotes.push({ id: "usdjpy", label: "USD/JPY", value: `¥${formatNumber(jpy, 2)}` });
    }
    if (quotes.length > 0) return quotes;
  } catch {
    /* try open.er-api fallback */
  }

  const er = await fetchDashboardJson<{ rates: Record<string, number> }>(
    "https://open.er-api.com/v6/latest/USD",
  );
  const krw = er.rates.KRW;
  if (krw != null) {
    quotes.push({ id: "usdkrw", label: "USD/KRW", value: `₩${formatNumber(krw, 0)}` });
  }
  const eur = er.rates.EUR;
  if (eur != null) {
    quotes.push({ id: "eurusd", label: "EUR/USD", value: formatNumber(1 / eur, 4) });
  }
  const jpy = er.rates.JPY;
  if (jpy != null) {
    quotes.push({ id: "usdjpy", label: "USD/JPY", value: `¥${formatNumber(jpy, 2)}` });
  }
  return quotes;
}

async function fetchGoldQuote(): Promise<EconomyQuote | null> {
  try {
    const coinbase = await fetchDashboardJson<{ data: { rates: Record<string, string> } }>(
      "https://api.coinbase.com/v2/exchange-rates?currency=USD",
    );
    const xauRate = Number(coinbase.data.rates.XAU);
    if (Number.isFinite(xauRate) && xauRate > 0) {
      return { id: "xau", label: "Gold (oz)", value: formatUsd(1 / xauRate, 0) };
    }
  } catch {
    /* optional */
  }
  return null;
}

export async function fetchDashboardEconomy(): Promise<EconomyQuote[]> {
  const [crypto, fx, gold] = await Promise.all([
    fetchCryptoQuotes().catch(() => [] as EconomyQuote[]),
    fetchFxQuotes().catch(() => [] as EconomyQuote[]),
    fetchGoldQuote().catch(() => null),
  ]);

  const quotes = [...crypto, ...fx, ...(gold ? [gold] : [])];
  if (quotes.length === 0) {
    throw new Error("no market quotes available");
  }
  return quotes;
}
