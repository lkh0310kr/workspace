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
