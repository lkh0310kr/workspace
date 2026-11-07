import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "./Popover";
import {
  claudeRateLimitStatus,
  codexRateLimitStatus,
  cursorUsageStatus,
  type ClaudeRateLimitStatus,
  type CodexRateLimitStatus,
  type CursorUsageStatus,
} from "../electron";
import {
  USAGE_PROVIDER_LABELS,
  type UsageProviderId,
  type UsageMeterSettings,
} from "../../../shared/usage-meter-settings";

const POLL_MS = 60_000;

function formatUsagePercent(usedPercent: number | null | undefined): string {
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return "-";
  }
  return `${Math.round(Math.max(0, Math.min(100, usedPercent)))}%`;
}

function formatPlanTypeLabel(planType: string | null | undefined): string {
  if (!planType) return "";
  const trimmed = planType.trim();
  if (!trimmed) return "";
  // Drop PUA / unassigned glyphs that render as "???" in some UI fonts.
  const safe = trimmed.replace(/[\uE000-\uF8FF\uFFF0-\uFFFF]/g, "").trim();
  return safe ? ` · ${safe}` : "";
}

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
    <span className="usage-meter-bar">
      <span className="usage-meter-bar-fill" style={{ width: `${clamped}%`, background: barColor(clamped) }} />
    </span>
  );
}

function DetailRow({
  label,
  usedPercent,
  resetsAtSec,
  now,
}: {
  label: string;
  usedPercent: number | null;
  resetsAtSec?: number | null;
  now: number;
}) {
  if (usedPercent == null) {
    return (
      <div className="usage-details-row">
        <span className="usage-details-label">{label}</span>
        <span className="usage-details-value">-</span>
      </div>
    );
  }
  const reset =
    resetsAtSec != null ? formatResetCountdown(resetsAtSec * 1000, now) : null;
  return (
    <div className="usage-details-row">
      <span className="usage-details-label">{label}</span>
      <span className="usage-details-value">
        <RateLimitBar usedPercent={usedPercent} />
        {formatUsagePercent(usedPercent)} used{reset ? ` · ${reset}` : ""}
      </span>
    </div>
  );
}

type Props = {
  meterSettings: UsageMeterSettings;
  onMeterSettingsChange: (next: UsageMeterSettings) => void;
  onOpenAppSettings: () => void;
};

export function AgentUsageStatusBar({
  meterSettings,
  onMeterSettingsChange,
  onOpenAppSettings,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [rateLimit, setRateLimit] = useState<ClaudeRateLimitStatus | null>(null);
  const [cursorUsage, setCursorUsage] = useState<CursorUsageStatus | null>(null);
  const [codexUsage, setCodexUsage] = useState<CodexRateLimitStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const enabled = meterSettings.enabled;

  const refreshMeters = useCallback(() => {
    if (enabled.includes("claude")) {
      claudeRateLimitStatus()
        .then((r) => setRateLimit(r))
        .catch(() => {});
    } else {
      setRateLimit(null);
    }
    if (enabled.includes("cursor")) {
      cursorUsageStatus()
        .then((u) => setCursorUsage(u))
        .catch(() => {});
    } else {
      setCursorUsage(null);
    }
    if (enabled.includes("codex")) {
      codexRateLimitStatus()
        .then((u) => setCodexUsage(u))
        .catch(() => {});
    } else {
      setCodexUsage(null);
    }
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      refreshMeters();
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMeters]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const window5h = rateLimit?.five_hour;
  const claudeReset =
    window5h?.resets_at != null ? formatResetCountdown(window5h.resets_at * 1000, now) : null;
  const hasClaudeRateLimit = enabled.includes("claude") && window5h != null;
  const cursorPercent = cursorUsage?.total_percent_used ?? null;
  const hasCursorUsage = enabled.includes("cursor") && cursorPercent != null;
  const codexPrimary = codexUsage?.session ?? codexUsage?.weekly ?? null;
  const hasCodexUsage = enabled.includes("codex") && codexPrimary != null;
  const cursorReset =
    cursorUsage?.billing_cycle_end_ms != null
      ? formatResetCountdown(cursorUsage.billing_cycle_end_ms, now)
      : null;

  if (enabled.length === 0) return null;

  const openDetails = () => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchorRect(rect);
    setDetailsOpen((open) => !open);
  };

  const toggleProvider = (id: UsageProviderId) => {
    const set = new Set(meterSettings.enabled);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next: UsageMeterSettings = {
      enabled: (["claude", "cursor", "codex", "gemini", "opencode"] as UsageProviderId[]).filter(
        (p) => set.has(p),
      ),
    };
    onMeterSettingsChange(next);
  };

  return (
    <>
      <div
        ref={barRef}
        className="status-bar status-bar-clickable"
        role="button"
        tabIndex={0}
        aria-expanded={detailsOpen}
        aria-label="AI agent usage - click for details"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          openDetails();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetails();
          }
        }}
      >
        {hasClaudeRateLimit && window5h && (
          <span className="status-bar-item" style={{ marginRight: 12 }}>
            Claude <RateLimitBar usedPercent={window5h.used_percent} />
            {formatUsagePercent(window5h.used_percent)} used{claudeReset ? ` · ${claudeReset}` : ""}
          </span>
        )}
        {hasCursorUsage && cursorPercent != null && (
          <span className="status-bar-item" style={{ marginRight: 12 }}>
            Cursor <RateLimitBar usedPercent={cursorPercent} />
            {formatUsagePercent(cursorPercent)} used{cursorReset ? ` · ${cursorReset}` : ""}
          </span>
        )}
        {hasCodexUsage && codexPrimary && (
          <span className="status-bar-item">
            Codex <RateLimitBar usedPercent={codexPrimary.used_percent} />
            {formatUsagePercent(codexPrimary.used_percent)} used
          </span>
        )}
        {!hasClaudeRateLimit && !hasCursorUsage && !hasCodexUsage && (
          <span className="status-bar-item">AI usage - click for details</span>
        )}
      </div>
        {detailsOpen && anchorRect && (
        <Popover
          anchorRect={anchorRect}
          onClose={() => setDetailsOpen(false)}
          align="start"
          className="usage-details-popover"
        >
          {/* Stop pointer events from reaching the terminal pane under the popover. */}
          <div onMouseDown={(e) => e.stopPropagation()}>
          <div className="usage-details-header">AI agent usage</div>
          {enabled.includes("claude") && (
            <section className="usage-details-section">
              <div className="usage-details-provider">{USAGE_PROVIDER_LABELS.claude}</div>
              <DetailRow label="5-hour window" usedPercent={window5h?.used_percent ?? null} resetsAtSec={window5h?.resets_at} now={now} />
              <DetailRow
                label="7-day window"
                usedPercent={rateLimit?.seven_day?.used_percent ?? null}
                resetsAtSec={rateLimit?.seven_day?.resets_at}
                now={now}
              />
            </section>
          )}
          {enabled.includes("cursor") && (
            <section className="usage-details-section">
              <div className="usage-details-provider">{USAGE_PROVIDER_LABELS.cursor}</div>
              <DetailRow label="Total (billing cycle)" usedPercent={cursorPercent} now={now} />
              <DetailRow label="Auto" usedPercent={cursorUsage?.auto_percent_used ?? null} now={now} />
              <DetailRow label="API" usedPercent={cursorUsage?.api_percent_used ?? null} now={now} />
              {cursorReset && (
                <div className="usage-details-hint">Cycle resets in {cursorReset}</div>
              )}
            </section>
          )}
          {enabled.includes("codex") && (
            <section className="usage-details-section">
              <div className="usage-details-provider">
                {USAGE_PROVIDER_LABELS.codex}
                {formatPlanTypeLabel(codexUsage?.plan_type)}
              </div>
              {codexUsage?.error === "no_auth" && (
                <div className="usage-details-hint">Sign in with Codex CLI (~/.codex/auth.json)</div>
              )}
              {codexUsage?.error === "fetch_failed" && (
                <div className="usage-details-hint">Could not load Codex usage</div>
              )}
              <DetailRow
                label="Session window"
                usedPercent={codexUsage?.session?.used_percent ?? null}
                resetsAtSec={codexUsage?.session?.resets_at}
                now={now}
              />
              <DetailRow
                label="Weekly window"
                usedPercent={codexUsage?.weekly?.used_percent ?? null}
                resetsAtSec={codexUsage?.weekly?.resets_at}
                now={now}
              />
            </section>
          )}
          {(enabled.includes("gemini") || enabled.includes("opencode")) && (
            <section className="usage-details-section">
              {enabled.includes("gemini") && (
                <div className="usage-details-provider">{USAGE_PROVIDER_LABELS.gemini}</div>
              )}
              {enabled.includes("opencode") && (
                <div className="usage-details-provider">{USAGE_PROVIDER_LABELS.opencode}</div>
              )}
              <div className="usage-details-hint">Usage tracking for this provider is not available yet.</div>
            </section>
          )}
          <div className="usage-details-section usage-details-toggles">
            <div className="usage-details-provider">Show in status bar</div>
            {(["claude", "cursor", "codex", "gemini", "opencode"] as UsageProviderId[]).map((id) => (
              <label key={id} className="usage-details-toggle">
                <input
                  type="checkbox"
                  checked={enabled.includes(id)}
                  onChange={() => void toggleProvider(id)}
                />
                {USAGE_PROVIDER_LABELS[id]}
              </label>
            ))}
          </div>
          <div className="usage-details-footer">
            <button type="button" className="usage-details-settings-link" onClick={onOpenAppSettings}>
              App settings...
            </button>
          </div>
          </div>
        </Popover>
      )}
    </>
  );
}
