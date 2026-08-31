import { useCallback, useEffect, useState } from "react";
import { fetchDashboardEconomy, type EconomyQuote } from "../../electron";
import { DASHBOARD_REFRESH_MS } from "../dashboardConfig";
import { DashboardWidget } from "../DashboardWidget";

export function EconomyWidget(): React.JSX.Element {
  const [quotes, setQuotes] = useState<EconomyQuote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuotes(await fetchDashboardEconomy());
    } catch {
      setError("시세를 불러오지 못했습니다");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), DASHBOARD_REFRESH_MS.economy);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <DashboardWidget
      className="dashboard-widget--wide dashboard-widget--markets"
      ariaLabel="시장 시세"
      onRefresh={() => void load()}
    >
      {loading && quotes.length === 0 ? (
        <p className="dashboard-muted">불러오는 중…</p>
      ) : error ? (
        <p className="dashboard-muted">{error}</p>
      ) : (
        <div className="dashboard-economy-grid">
          {quotes.map((quote) => (
            <div key={quote.id} className="dashboard-economy-card">
              <span className="dashboard-economy-symbol">{quote.label}</span>
              <span className="dashboard-economy-value">{quote.value}</span>
              {quote.change ? (
                <span
                  className={
                    quote.changeUp
                      ? "dashboard-economy-change dashboard-economy-change--up"
                      : "dashboard-economy-change dashboard-economy-change--down"
                  }
                >
                  {quote.change}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </DashboardWidget>
  );
}
