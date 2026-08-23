import { useEffect, useState } from "react";
import {
  claudeCodeUsageRecent,
  claudeRateLimitStatus,
  type ClaudeUsage,
  type ClaudeRateLimitStatus,
} from "../tauri";

const POLL_MS = 60_000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatResetCountdown(resetsAtSeconds: number, now: number): string | null {
  const diffMs = resetsAtSeconds * 1000 - now;
  if (diffMs <= 0) return null;
  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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

// Both sourced from Claude Code's own local data — approximate, not
// billing-accurate. Token/cost comes from summing this machine's JSONL
// transcripts (claude_code_usage_recent); the rate-limit % and reset
// countdown come from Claude Code's own statusLine hook payload, which is
// the only source for real usage-window percentages (see
// install_claude_statusline_hook in src/lib.rs) — chained behind
// ref-proj/orca's own existing statusline hook so this doesn't break
// Orca's usage tracking if it's also in use.
export function ClaudeUsageStatusBar() {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [rateLimit, setRateLimit] = useState<ClaudeRateLimitStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      claudeCodeUsageRecent().then((u) => {
        if (!cancelled) setUsage(u);
      }).catch(() => {});
      claudeRateLimitStatus().then((r) => {
        if (!cancelled) setRateLimit(r);
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
  const reset = window5h?.resets_at != null ? formatResetCountdown(window5h.resets_at, now) : null;

  const hasUsage = usage && usage.total_tokens > 0;
  const hasRateLimit = window5h != null;
  if (!hasUsage && !hasRateLimit) return null;

  return (
    <div className="status-bar">
      {hasRateLimit && (
        <span
          className="status-bar-item"
          style={{ marginRight: 12 }}
          title="Claude Code 5-hour rate-limit window (from Claude Code's own statusLine hook)"
        >
          Claude Code <RateLimitBar usedPercent={window5h.used_percent} />
          {Math.round(window5h.used_percent)}% used{reset ? ` · ${reset}` : ""}
        </span>
      )}
      {hasUsage && (
        <span
          className="status-bar-item"
          title="Claude Code usage, last 24h (approximate — not a billing-accurate figure)"
        >
          {!hasRateLimit && "Claude Code · "}${usage.cost_usd.toFixed(2)} · {formatTokens(usage.total_tokens)} tokens (24h)
        </span>
      )}
    </div>
  );
}
