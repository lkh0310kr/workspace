import { useEffect, useState } from "react";
import { claudeCodeUsageRecent, type ClaudeUsage } from "../tauri";

const POLL_MS = 60_000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Approximate local estimate from Claude Code's own JSONL transcripts (see
// claude_code_usage_recent in src/lib.rs) — not a billing-accurate figure,
// same caveat Orca's own usage panes carry for the same data source.
export function ClaudeUsageStatusBar() {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      claudeCodeUsageRecent().then((u) => {
        if (!cancelled) setUsage(u);
      }).catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!usage || usage.total_tokens === 0) return null;

  return (
    <div className="status-bar">
      <span className="status-bar-item" title="Claude Code usage, last 24h (approximate — not a billing-accurate figure)">
        Claude Code · ${usage.cost_usd.toFixed(2)} · {formatTokens(usage.total_tokens)} tokens (24h)
      </span>
    </div>
  );
}
