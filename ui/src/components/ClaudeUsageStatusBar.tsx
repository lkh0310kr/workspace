import { useEffect, useState } from "react";
import {
  claudeRateLimitStatus,
  cursorUsageStatus,
  type ClaudeRateLimitStatus,
  type CursorUsageStatus,
} from "../tauri";

const POLL_MS = 60_000;

function formatResetCountdown(resetsAtMs: number, now: number): string | null {
  const diffMs = resetsAtMs - now;
  if (diffMs <= 0) return null;
  const totalMinutes = Math.round(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function barColor(usedPercent: number): string {
  if (usedPercent >= 90) return "#cc0000";
  if (usedPercent >= 70) return "#c79100";
  return "#4e9a06";
}

function RateLimitBar({ usedPercent }: { usedPercent: number }) {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  return (
    <span
      style={{
        display: "inline-block",
        width: 28,
        height: 5,
        borderRadius: 3,
        background: "var(--bg-hover)",
        overflow: "hidden",
        verticalAlign: "middle",
        marginRight: 4,
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${clamped}%`,
          background: barColor(clamped),
        }}
      />
    </span>
  );
}

// Claude rate-limit % comes from Claude Code's own statusLine hook payload
// (see install_claude_statusline_hook in src/lib.rs). Cursor usage comes
// from Cursor's DashboardService API, authenticated with the token Cursor
// already stored in its local state.vscdb.
export function ClaudeUsageStatusBar() {
  const [rateLimit, setRateLimit] = useState<ClaudeRateLimitStatus | null>(null);
  const [cursorUsage, setCursorUsage] = useState<CursorUsageStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      claudeRateLimitStatus().then((r) => {
        if (!cancelled) setRateLimit(r);
      }).catch(() => {});
      cursorUsageStatus().then((u) => {
        if (!cancelled) setCursorUsage(u);
      }).catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const window5h = rateLimit?.five_hour;
  const claudeReset = window5h?.resets_at != null ? formatResetCountdown(window5h.resets_at * 1000, now) : null;
  const hasClaudeRateLimit = window5h != null;
  const hasCursorUsage = cursorUsage?.total_percent_used != null;

  if (!hasClaudeRateLimit && !hasCursorUsage) return null;

  const cursorPercent = cursorUsage?.total_percent_used ?? 0;
  const cursorReset =
    cursorUsage?.billing_cycle_end_ms != null
      ? formatResetCountdown(cursorUsage.billing_cycle_end_ms, now)
      : null;

  return (
    <div className="status-bar">
      {hasClaudeRateLimit && (
        <span
          className="status-bar-item"
          style={{ marginRight: 12 }}
          title="Claude Code 5-hour rate-limit window (from Claude Code's own statusLine hook)"
        >
          Claude Code <RateLimitBar usedPercent={window5h.used_percent} />
          {Math.round(window5h.used_percent)}% used{claudeReset ? ` · ${claudeReset}` : ""}
        </span>
      )}
      {hasCursorUsage && (
        <span
          className="status-bar-item"
          title="Cursor included usage for the current billing cycle (from Cursor dashboard API)"
        >
          Cursor <RateLimitBar usedPercent={cursorPercent} />
          {Math.round(cursorPercent)}% used{cursorReset ? ` · ${cursorReset}` : ""}
        </span>
      )}
    </div>
  );
}
