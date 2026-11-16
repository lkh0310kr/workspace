import {
  normalizeUsageMeterSettings,
  type UsageMeterSettings
} from '../../../../shared/usage-meter-settings'

export interface ClaudeRateLimitWindow {
  used_percent: number
  resets_at: number | null
}

export interface ClaudeRateLimitStatus {
  five_hour: ClaudeRateLimitWindow | null
  seven_day: ClaudeRateLimitWindow | null
}

export interface CursorUsageStatus {
  auto_percent_used: number | null
  api_percent_used: number | null
  total_percent_used: number | null
  billing_cycle_end_ms: number | null
}

export interface CodexRateLimitWindow {
  used_percent: number
  resets_at: number | null
  window_minutes: number | null
}

export interface CodexRateLimitStatus {
  plan_type: string | null
  session: CodexRateLimitWindow | null
  weekly: CodexRateLimitWindow | null
  error: 'no_auth' | 'fetch_failed' | null
}

function toRateLimitWindow(
  window: { usedPercent: number; resetsAt: number | null } | null
): ClaudeRateLimitWindow | null {
  return window ? { used_percent: window.usedPercent, resets_at: window.resetsAt } : null
}

export async function claudeRateLimitStatus(): Promise<ClaudeRateLimitStatus> {
  const status = await window.api.usage.claudeRateLimitStatus()
  return {
    five_hour: toRateLimitWindow(status.fiveHour),
    seven_day: toRateLimitWindow(status.sevenDay)
  }
}

export async function cursorUsageStatus(): Promise<CursorUsageStatus> {
  const status = await window.api.usage.cursorUsageStatus()
  return {
    auto_percent_used: status.autoPercentUsed,
    api_percent_used: status.apiPercentUsed,
    total_percent_used: status.totalPercentUsed,
    billing_cycle_end_ms: status.billingCycleEndMs
  }
}

function toCodexWindow(
  window: {
    usedPercent: number
    resetsAt: number | null
    windowMinutes: number | null
  } | null
): CodexRateLimitWindow | null {
  return window
    ? {
        used_percent: window.usedPercent,
        resets_at: window.resetsAt,
        window_minutes: window.windowMinutes
      }
    : null
}

export async function codexRateLimitStatus(): Promise<CodexRateLimitStatus> {
  const status = await window.api.usage.codexRateLimitStatus()
  return {
    plan_type: status.planType,
    session: toCodexWindow(status.session),
    weekly: toCodexWindow(status.weekly),
    error: status.error
  }
}

export async function loadUsageMeterSettings(): Promise<UsageMeterSettings> {
  const raw = await window.api.usage.meterSettingsGet()
  return normalizeUsageMeterSettings(raw)
}

export async function saveUsageMeterSettings(settings: UsageMeterSettings): Promise<void> {
  await window.api.usage.meterSettingsSave(settings)
}
