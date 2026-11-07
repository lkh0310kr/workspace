import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { appSupportDir } from "./persistence";

// Port of src/lib.rs's install_claude_statusline_hook/claude_rate_limit_status
// /cursor_usage_status. claude_code_usage_recent (JSONL transcript scanning
// + the per-model USD pricing table) is deliberately NOT ported — grepping
// ui/src confirms ClaudeUsageStatusBar.tsx (the only consumer of this API
// surface) never actually calls it, so it was dead code even in the Tauri
// app.

export interface ClaudeRateLimitWindow {
  usedPercent: number;
  resetsAt: number | null;
}

export interface ClaudeRateLimitStatus {
  fiveHour: ClaudeRateLimitWindow | null;
  sevenDay: ClaudeRateLimitWindow | null;
}

export interface CursorUsageStatus {
  autoPercentUsed: number | null;
  apiPercentUsed: number | null;
  totalPercentUsed: number | null;
  billingCycleEndMs: number | null;
}

export interface CodexRateLimitWindow {
  usedPercent: number;
  resetsAt: number | null;
  windowMinutes: number | null;
}

export interface CodexRateLimitStatus {
  planType: string | null;
  session: CodexRateLimitWindow | null;
  weekly: CodexRateLimitWindow | null;
  /** Set when Codex is enabled but auth or network failed. */
  error: "no_auth" | "fetch_failed" | null;
}

const CODEX_SESSION_WINDOW_MINUTES = 300;
const CODEX_WEEKLY_WINDOW_MINUTES = 10080;
const CODEX_WINDOW_DURATION_TOLERANCE_MINUTES = 1;

type CodexWindowSnapshot = {
  usedPercent: number;
  windowDurationMins?: number;
  resetsAt: number | null;
};

function classifyCodexWindows(
  primary: CodexWindowSnapshot | null,
  secondary: CodexWindowSnapshot | null,
): { session: CodexWindowSnapshot | null; weekly: CodexWindowSnapshot | null } {
  const classifyKind = (w: CodexWindowSnapshot): "session" | "weekly" | null => {
    const duration = w.windowDurationMins;
    if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
    if (Math.abs(duration - CODEX_SESSION_WINDOW_MINUTES) <= CODEX_WINDOW_DURATION_TOLERANCE_MINUTES) {
      return "session";
    }
    if (Math.abs(duration - CODEX_WEEKLY_WINDOW_MINUTES) <= CODEX_WINDOW_DURATION_TOLERANCE_MINUTES) {
      return "weekly";
    }
    return null;
  };

  let session: CodexWindowSnapshot | null = null;
  let weekly: CodexWindowSnapshot | null = null;
  for (const w of [primary, secondary]) {
    if (!w) continue;
    const kind = classifyKind(w);
    if (kind === "session" && !session) session = w;
    else if (kind === "weekly" && !weekly) weekly = w;
  }
  if (!session && primary && classifyKind(primary) === null) session = primary;
  if (!weekly && secondary && classifyKind(secondary) === null) weekly = secondary;
  return { session, weekly };
}

function codexAuthPath(): string {
  const home = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  return path.join(home, "auth.json");
}

/** Codex usage from ChatGPT backend API (same source as Codex CLI), using ~/.codex/auth.json. */
export async function codexRateLimitStatus(): Promise<CodexRateLimitStatus> {
  const empty: CodexRateLimitStatus = {
    planType: null,
    session: null,
    weekly: null,
    error: null,
  };
  let authRaw: string;
  try {
    authRaw = fs.readFileSync(codexAuthPath(), "utf8");
  } catch {
    return { ...empty, error: "no_auth" };
  }
  let auth: { tokens?: { access_token?: string; account_id?: string } };
  try {
    auth = JSON.parse(authRaw);
  } catch {
    return { ...empty, error: "no_auth" };
  }
  const accessToken = auth.tokens?.access_token;
  if (!accessToken) {
    return { ...empty, error: "no_auth" };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "codex-cli",
    "OpenAI-Beta": "codex-1",
    originator: "Codex Desktop",
  };
  if (auth.tokens?.account_id) {
    headers["ChatGPT-Account-Id"] = auth.tokens.account_id;
  }
  try {
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ...empty, error: "fetch_failed" };
    }
    const payload = (await response.json()) as {
      plan_type?: string;
      rate_limit?: {
        primary_window?: { used_percent?: number; limit_window_seconds?: number; reset_at?: number };
        secondary_window?: { used_percent?: number; limit_window_seconds?: number; reset_at?: number };
      };
    };
    if (typeof payload.plan_type !== "string") {
      return { ...empty, error: "fetch_failed" };
    }
    const readUsedPercent = (v: unknown): number | null => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const toSnapshot = (
      raw:
        | { used_percent?: unknown; limit_window_seconds?: number; reset_at?: number }
        | null
        | undefined,
    ): CodexWindowSnapshot | null => {
      const usedPercent = readUsedPercent(raw?.used_percent);
      if (!raw || usedPercent == null) return null;
      const secs = raw.limit_window_seconds;
      const windowDurationMins =
        typeof secs === "number" && Number.isFinite(secs) && secs > 0 ? Math.ceil(secs / 60) : undefined;
      return {
        usedPercent,
        windowDurationMins,
        resetsAt: typeof raw.reset_at === "number" ? raw.reset_at : null,
      };
    };
    const primary = toSnapshot(payload.rate_limit?.primary_window);
    const secondary = toSnapshot(payload.rate_limit?.secondary_window);
    const classified = classifyCodexWindows(primary, secondary);
    const mapWindow = (w: CodexWindowSnapshot | null): CodexRateLimitWindow | null =>
      w
        ? {
            usedPercent: w.usedPercent,
            resetsAt: w.resetsAt,
            windowMinutes: w.windowDurationMins ?? null,
          }
        : null;
    return {
      planType: payload.plan_type,
      session: mapWindow(classified.session),
      weekly: mapWindow(classified.weekly),
      error: null,
    };
  } catch {
    return { ...empty, error: "fetch_failed" };
  }
}

/**
 * Claude Code (>=2.1.80) pipes a JSON payload containing rate_limits to
 * whatever command statusLine.command names in ~/.claude/settings.json,
 * once per turn — the only way to get the CLI's own real usage-window
 * percentages. Installs a wrapper that tees the payload to our own file
 * *and* forwards it unchanged to whatever command was already configured
 * (e.g. Orca's own statusline hook), so this doesn't clobber it. Idempotent:
 * does nothing if statusLine.command already points at our wrapper.
 */
export function installClaudeStatuslineHook(): void {
  const dir = appSupportDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  const wrapperPath = path.join(dir, "claude-statusline.sh");
  const origCmdPath = path.join(dir, "claude-statusline-orig-command.sh");

  const home = os.homedir();
  const settingsPath = path.join(home, ".claude", "settings.json");
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return;
  }

  const existingCommand =
    (settings.statusLine as { command?: string } | undefined)?.command ?? "";
  if (existingCommand.includes(wrapperPath)) return;

  try {
    fs.writeFileSync(origCmdPath, existingCommand);
  } catch {
    return;
  }

  const jsonPath = path.join(dir, "claude-statusline.json");
  const wrapperScript = `#!/bin/sh
payload=$(cat)
case "$payload" in
  *'"rate_limits"'*)
    printf '%s' "$payload" > ${JSON.stringify(jsonPath)}
    ;;
esac
if [ -s ${JSON.stringify(origCmdPath)} ]; then
  printf '%s' "$payload" | sh -c "$(cat ${JSON.stringify(origCmdPath)})"
fi
`;
  try {
    fs.writeFileSync(wrapperPath, wrapperScript);
    fs.chmodSync(wrapperPath, 0o755);
  } catch {
    return;
  }

  settings.statusLine = { type: "command", command: `sh ${JSON.stringify(wrapperPath)}` };
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {
    // Best-effort, same as the Rust version.
  }
}

function parseRateLimitWindow(v: unknown): ClaudeRateLimitWindow | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const usedPercent = obj.used_percentage ?? obj.utilization;
  if (typeof usedPercent !== "number") return null;
  const resetsAt = typeof obj.resets_at === "number" ? obj.resets_at : null;
  return { usedPercent, resetsAt };
}

/** Reads the file installClaudeStatuslineHook's wrapper script writes on
 * every Claude Code turn. Stale/missing simply reads as "no data". */
export function claudeRateLimitStatus(): ClaudeRateLimitStatus {
  const empty: ClaudeRateLimitStatus = { fiveHour: null, sevenDay: null };
  try {
    const contents = fs.readFileSync(path.join(appSupportDir(), "claude-statusline.json"), "utf8");
    const v = JSON.parse(contents);
    const rateLimits = v.rate_limits;
    if (!rateLimits) return empty;
    return {
      fiveHour: parseRateLimitWindow(rateLimits.five_hour),
      sevenDay: parseRateLimitWindow(rateLimits.seven_day),
    };
  } catch {
    return empty;
  }
}

function cursorStateDbPath(): string | null {
  const home = os.homedir();
  if (!home) return null;
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
  }
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (!appdata) return null;
    return path.join(appdata, "Cursor", "User", "globalStorage", "state.vscdb");
  }
  return path.join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb");
}

function cursorAccessToken(): string | null {
  const dbPath = cursorStateDbPath();
  if (!dbPath) return null;
  try {
    const out = execFileSync(
      "sqlite3",
      [dbPath, "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken' LIMIT 1;"],
      { timeout: 5000 },
    )
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Reads Cursor's billing-cycle usage from the same DashboardService RPC
 * the Cursor IDE dashboard calls, authenticated with the access token
 * Cursor already stored in its local state.vscdb — no API key needed. */
export function cursorUsageStatus(): CursorUsageStatus {
  const empty: CursorUsageStatus = {
    autoPercentUsed: null,
    apiPercentUsed: null,
    totalPercentUsed: null,
    billingCycleEndMs: null,
  };
  const token = cursorAccessToken();
  if (!token) return empty;
  try {
    const out = execFileSync(
      "curl",
      [
        "-sS",
        "--max-time",
        "10",
        "-X",
        "POST",
        "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
        "-H",
        `Authorization: Bearer ${token}`,
        "-H",
        "Content-Type: application/json",
        "-d",
        "{}",
      ],
      { timeout: 11000 },
    ).toString();
    const body = JSON.parse(out);
    const planUsage = body.planUsage ?? {};
    const billingCycleEnd = body.billingCycleEnd;
    return {
      autoPercentUsed: typeof planUsage.autoPercentUsed === "number" ? planUsage.autoPercentUsed : null,
      apiPercentUsed: typeof planUsage.apiPercentUsed === "number" ? planUsage.apiPercentUsed : null,
      totalPercentUsed: typeof planUsage.totalPercentUsed === "number" ? planUsage.totalPercentUsed : null,
      billingCycleEndMs:
        typeof billingCycleEnd === "number"
          ? billingCycleEnd
          : typeof billingCycleEnd === "string" && billingCycleEnd !== ""
            ? Number(billingCycleEnd)
            : null,
    };
  } catch {
    return empty;
  }
}
