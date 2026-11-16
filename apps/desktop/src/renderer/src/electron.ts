// Renderer-side adapters for Electron preload APIs. Feature-specific IPC
// capabilities live beside their owning feature where that boundary exists.

import {
  normalizeUsageMeterSettings,
  type UsageMeterSettings
} from '../../shared/usage-meter-settings'

export async function hostname(): Promise<string> {
  return window.api.hostname()
}

export async function getDebugLogsDir(): Promise<string | null> {
  try {
    return await window.api.debug.getLogsDir()
  } catch {
    return null
  }
}

// Legacy IME trace hook — now writes to app.ndjson via the unified file logger.
export async function debugLog(line: string): Promise<void> {
  try {
    window.api.debug?.appLog('renderer', 'debug', 'debug_log', { line })
  } catch {
    /* ignore */
  }
}

/** Fires when a <webview> guest tries to open a new window (target=_blank,
 * window.open()) — main/index.ts denies the native window and forwards it
 * here instead. `hostWebContentsId` identifies which webview guest it
 * came from (matches Electron.WebviewTag.getWebContentsId()). */
export function onBrowserOpenNewTab(
  handler: (payload: { hostWebContentsId: number; url: string }) => void
): () => void {
  return window.api.browser.onOpenNewTab(handler)
}

/** Fires when web content enters or exits fullscreen. */
export function onHtmlFullscreenChanged(handler: (active: boolean) => void): () => void {
  return window.api.browser.onHtmlFullscreenChanged(handler)
}

/** Cmd+R/Cmd+Shift+R, intercepted at the main-process input-event level
 * (see main/index.ts for why a renderer keydown listener wouldn't reliably
 * see this) and repurposed to reload the active browser tab instead of
 * the whole app. */
export function onBrowserReloadShortcut(handler: (payload: { hard: boolean }) => void): () => void {
  return window.api.shortcuts.onBrowserReload(handler)
}

/** Cmd/Ctrl+P, intercepted in Electron before Chromium treats it as Print. */
export function onQuickOpenShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onQuickOpen(handler)
}

/** Cmd/Ctrl+` returns to Home, even while an embedded browser has focus. */
export function onHomeShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onHome(handler)
}

/** Cmd/Ctrl+Shift+F, routed from Electron so editor keymaps cannot consume it. */
export function onFindInFilesShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onFindInFiles(handler)
}

/** Cmd/Ctrl+\\, routed from Electron so embedded surfaces cannot swallow it. */
export function onToggleEditorTreeShortcut(handler: () => void): () => void {
  // A renderer can hot-reload before Electron reloads its preload bundle.
  // Keep that brief version skew from crashing the pane; its DOM shortcut
  // handler remains available until the Electron process is restarted.
  const shortcuts = window.api.shortcuts as typeof window.api.shortcuts & {
    onToggleExplorer?: (cb: () => void) => () => void
  }
  const subscribe = shortcuts.onToggleExplorer
  return typeof subscribe === 'function' ? subscribe(handler) : () => {}
}

/** Cmd/Ctrl+F, routed through Electron so production shortcuts reach the focused editor. */
export function onFindInEditorShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onFindInEditor(handler)
}

/** Cmd/Ctrl +/- — relayed from main when a browser guest holds focus (Orca pattern). */
export function onBrowserZoomShortcut(
  handler: (payload: { direction: 'in' | 'out'; webContentsId: number }) => void
): () => void {
  return window.api.shortcuts.onBrowserZoom(handler)
}

/** Cmd+W — closes the active pane tab instead of the whole window. */
export function onClosePaneTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onClosePaneTab(handler)
}

export function onOpenSettingsShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onOpenSettings(handler)
}

/** Cmd+N — same action as WorkspaceTabRail's "+" button. */
export function onNewWorkspaceTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onNewWorkspaceTab(handler)
}

/** Cmd+Shift+V — paste clipboard as plain text in the focused editor. */
export function onPastePlainTextShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onPastePlainText(handler)
}

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
  w: { usedPercent: number; resetsAt: number | null } | null
): ClaudeRateLimitWindow | null {
  return w ? { used_percent: w.usedPercent, resets_at: w.resetsAt } : null
}

export async function claudeRateLimitStatus(): Promise<ClaudeRateLimitStatus> {
  const s = await window.api.usage.claudeRateLimitStatus()
  return { five_hour: toRateLimitWindow(s.fiveHour), seven_day: toRateLimitWindow(s.sevenDay) }
}

export async function cursorUsageStatus(): Promise<CursorUsageStatus> {
  const s = await window.api.usage.cursorUsageStatus()
  return {
    auto_percent_used: s.autoPercentUsed,
    api_percent_used: s.apiPercentUsed,
    total_percent_used: s.totalPercentUsed,
    billing_cycle_end_ms: s.billingCycleEndMs
  }
}

function toCodexWindow(
  w: { usedPercent: number; resetsAt: number | null; windowMinutes: number | null } | null
): CodexRateLimitWindow | null {
  return w
    ? { used_percent: w.usedPercent, resets_at: w.resetsAt, window_minutes: w.windowMinutes }
    : null
}

export async function codexRateLimitStatus(): Promise<CodexRateLimitStatus> {
  const s = await window.api.usage.codexRateLimitStatus()
  return {
    plan_type: s.planType,
    session: toCodexWindow(s.session),
    weekly: toCodexWindow(s.weekly),
    error: s.error
  }
}

export async function loadUsageMeterSettings(): Promise<UsageMeterSettings> {
  const raw = await window.api.usage.meterSettingsGet()
  return normalizeUsageMeterSettings(raw)
}

export async function saveUsageMeterSettings(settings: UsageMeterSettings): Promise<void> {
  await window.api.usage.meterSettingsSave(settings)
}
