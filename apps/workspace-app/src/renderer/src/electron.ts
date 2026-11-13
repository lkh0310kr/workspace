// Renderer-side API shim, deliberately shaped to match the Tauri app's
// ui/src/tauri.ts export surface (same function names, same snake_case
// field names on TabInfo/WorkspaceState/DirEntry) even though the IPC
// layer underneath (window.api, from preload/index.ts) uses camelCase.
// The point is to let App.tsx/WorkspaceTabRail.tsx/panes/etc. be ported
// with import-path-only changes instead of a field-name rewrite
// throughout every consumer.

import {
  normalizeUsageMeterSettings,
  type UsageMeterSettings,
} from "../../shared/usage-meter-settings";

// Workspace rail tab IPC — see workspaceApi.ts (re-exported here for
// existing `from "../electron"` import sites).
export type { TabInfo, WorkspaceState } from "./workspaceApi";
export {
  getWorkspaceState,
  addTab,
  closeTab,
  selectTab,
  renameTab,
  reorderTabs,
  setTabLayout,
  setTabRootPath,
  onWorkspaceUpdated,
} from "./workspaceApi";

// File System module — see fileSystem.ts (Phase 1 foundation split; this
// re-export keeps every existing `from "../electron"` import site
// working unchanged).
export * from "./fileSystem";

export interface PtyOutput {
  id: number;
  seq: number;
  data_b64: string;
}

export interface PtyConnectResult {
  id: number;
  snapshot: string;
  snapshotCols: number;
  snapshotRows: number;
  lastSeq: number;
  isReattach: boolean;
}

export async function ptyConnect(id: number): Promise<PtyConnectResult> {
  return window.api.pty.connect(id);
}

export function ptyDisconnect(id: number): void {
  window.api.pty.disconnect(id);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function hostname(): Promise<string> {
  return window.api.hostname();
}

export async function getDebugLogsDir(): Promise<string | null> {
  try {
    return await window.api.debug.getLogsDir();
  } catch {
    return null;
  }
}

// Legacy IME trace hook — now writes to app.ndjson via the unified file logger.
export async function debugLog(line: string): Promise<void> {
  try {
    window.api.debug?.appLog("renderer", "debug", "debug_log", { line });
  } catch {
    /* ignore */
  }
}

export async function ptyWrite(id: number, data: Uint8Array): Promise<void> {
  window.api.pty.write(id, data);
}

export async function ptyResize(id: number, cols: number, rows: number): Promise<void> {
  window.api.pty.resize(id, cols, rows);
}

export async function spawnTerminal(cols = 120, rows = 40, tabId?: number): Promise<number> {
  return window.api.pty.spawn(cols, rows, tabId);
}

export async function getMediaUrl(tabId: number, path: string): Promise<string | null> {
  return window.api.media.getUrl(tabId, path);
}

export async function getMediaUrlAbsolute(absolutePath: string): Promise<string> {
  return window.api.media.getUrlAbsolute(absolutePath);
}

export type { SceneManifest } from "../../shared/model3d/types";

export async function openModelPreview(tabId: number, rel: string): Promise<import("../../shared/model3d/types").SceneManifest> {
  if (!window.api.model3d?.openPreview) {
    throw new Error("model3d API unavailable — restart the app");
  }
  return window.api.model3d.openPreview(tabId, rel);
}

export type { AssetOpenRequest, ImportJob } from "../../shared/model3d/types";

export async function openModelAsset(request: import("../../shared/model3d/types").AssetOpenRequest): Promise<import("../../shared/model3d/types").ImportJob> {
  if (!window.api.model3d?.openAsset) {
    throw new Error("model3d API unavailable — restart the app");
  }
  return window.api.model3d.openAsset(request) as Promise<import("../../shared/model3d/types").ImportJob>;
}

export async function getModelUrl(tabId: number, rel: string): Promise<string | null> {
  if (!window.api.model3d?.getUrl) {
    throw new Error("model3d API unavailable — restart the app");
  }
  return window.api.model3d.getUrl(tabId, rel);
}

export type { CadViewerOpenResult } from "../../shared/cadViewer";

export async function openCadViewerFile(
  tabId: number,
  rel: string,
): Promise<import("../../shared/cadViewer").CadViewerOpenResult> {
  if (!window.api.cad?.openFile) {
    throw new Error("cad API unavailable — restart the app");
  }
  return window.api.cad.openFile(tabId, rel);
}

export interface EpubSpineItem {
  href: string;
  mediaType: string;
}

export interface EpubBook {
  bookId: string;
  title: string;
  spine: EpubSpineItem[];
  sizes: Record<string, number>;
}

export async function openEpub(tabId: number, path: string): Promise<EpubBook> {
  return window.api.epub.open(tabId, path);
}

export async function openEpubAbsolute(absolutePath: string): Promise<EpubBook> {
  return window.api.epub.openAbsolute(absolutePath);
}

export async function getEbookState(
  tabId: number | null,
  rel: string | null,
  absolutePath?: string,
): Promise<import("../../shared/ebookState").EbookBookState> {
  return window.api.epub.getState(tabId, rel, absolutePath);
}

export async function saveEbookState(
  tabId: number | null,
  rel: string | null,
  absolutePath: string | undefined,
  patch: Partial<import("../../shared/ebookState").EbookBookState>,
): Promise<import("../../shared/ebookState").EbookBookState> {
  return window.api.epub.saveState(tabId, rel, absolutePath, patch);
}

export function epubResourceUrl(bookId: string, href: string): string {
  return `workspace-epub://${bookId}/${href}`;
}

// Tauri's onXxx helpers return a Promise<UnlistenFn> (listen() is async).
// Kept as sync-returning here (window.api's ipcRenderer.on wiring is
// synchronous), but callers that do `unlisten.then((fn) => fn())` still
// work fine against a plain function since `Promise.resolve(fn).then(...)`
// isn't required — callers are ported to call the returned function
// directly instead.
export function onPtyOutput(handler: (payload: PtyOutput) => void): () => void {
  return window.api.pty.onData((id, seq, data) => {
    handler({ id, seq, data_b64: bytesToBase64(data) });
  });
}

export async function pickMediaFileDialog(kind: "video" | "audio" | "ebook"): Promise<string | null> {
  const result = await window.api.dialog.pickMediaFile(kind);
  if (result.ok) return result.path;
  if (!result.canceled && result.error) throw new Error(result.error);
  return null;
}

export function writeClipboardText(text: string): void {
  window.api.clipboard.writeText(text);
}

export function readClipboardText(): Promise<string> {
  return window.api.clipboard.readText();
}

export function saveClipboardImageAsTempFile(): Promise<string | null> {
  return window.api.clipboard.saveImageAsTempFile();
}

/** Fires when a <webview> guest tries to open a new window (target=_blank,
 * window.open()) — main/index.ts denies the native window and forwards it
 * here instead. `hostWebContentsId` identifies which webview guest it
 * came from (matches Electron.WebviewTag.getWebContentsId()). */
export function onBrowserOpenNewTab(handler: (payload: { hostWebContentsId: number; url: string }) => void): () => void {
  return window.api.browser.onOpenNewTab(handler);
}

/** Fires when web content enters or exits fullscreen. */
export function onHtmlFullscreenChanged(handler: (active: boolean) => void): () => void {
  return window.api.browser.onHtmlFullscreenChanged(handler);
}

/** Cmd+R/Cmd+Shift+R, intercepted at the main-process input-event level
 * (see main/index.ts for why a renderer keydown listener wouldn't reliably
 * see this) and repurposed to reload the active browser tab instead of
 * the whole app. */
export function onBrowserReloadShortcut(handler: (payload: { hard: boolean }) => void): () => void {
  return window.api.shortcuts.onBrowserReload(handler);
}

/** Cmd/Ctrl+P, intercepted in Electron before Chromium treats it as Print. */
export function onQuickOpenShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onQuickOpen(handler);
}

/** Cmd/Ctrl+` returns to Home, even while an embedded browser has focus. */
export function onHomeShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onHome(handler);
}

/** Cmd/Ctrl+Shift+F, routed from Electron so editor keymaps cannot consume it. */
export function onFindInFilesShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onFindInFiles(handler);
}

/** Cmd/Ctrl+F, routed through Electron so production shortcuts reach the focused editor. */
export function onFindInEditorShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onFindInEditor(handler);
}

/** Cmd/Ctrl +/- — relayed from main when a browser guest holds focus (Orca pattern). */
export function onBrowserZoomShortcut(
  handler: (payload: { direction: 'in' | 'out'; webContentsId: number }) => void,
): () => void {
  return window.api.shortcuts.onBrowserZoom(handler);
}

/** Cmd+W — closes the active pane tab instead of the whole window. */
export function onClosePaneTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onClosePaneTab(handler);
}

export function onOpenSettingsShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onOpenSettings(handler);
}

/** Cmd+N — same action as WorkspaceTabRail's "+" button. */
export function onNewWorkspaceTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onNewWorkspaceTab(handler);
}

export function onShortcutModifierReleased(handler: () => void): () => void {
  return window.api.shortcuts.onShortcutModifierReleased(handler);
}

export function onShortcutModifierPressed(handler: () => void): () => void {
  return window.api.shortcuts.onShortcutModifierPressed(handler);
}

/** Cmd/Ctrl+1..9 — relayed from main so terminal focus cannot swallow the meta chord. */
export function onSwitchWorkspaceTabIndexShortcut(
  handler: (payload: { index: number }) => void,
): () => void {
  return window.api.shortcuts.onSwitchWorkspaceTabIndex(handler);
}

/** Cmd+Shift+V — paste clipboard as plain text in the focused editor. */
export function onPastePlainTextShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onPastePlainText(handler);
}

/** Cmd/Ctrl+V relayed from main when a terminal pane owns focus. */
export function onTerminalPasteShortcut(
  handler: (payload: { terminalId: number }) => void,
): () => void {
  return window.api.shortcuts.onTerminalPaste(handler);
}

export interface ClaudeRateLimitWindow {
  used_percent: number;
  resets_at: number | null;
}

export interface ClaudeRateLimitStatus {
  five_hour: ClaudeRateLimitWindow | null;
  seven_day: ClaudeRateLimitWindow | null;
}

export interface CursorUsageStatus {
  auto_percent_used: number | null;
  api_percent_used: number | null;
  total_percent_used: number | null;
  billing_cycle_end_ms: number | null;
}

export interface CodexRateLimitWindow {
  used_percent: number;
  resets_at: number | null;
  window_minutes: number | null;
}

export interface CodexRateLimitStatus {
  plan_type: string | null;
  session: CodexRateLimitWindow | null;
  weekly: CodexRateLimitWindow | null;
  error: "no_auth" | "fetch_failed" | null;
}

function toRateLimitWindow(
  w: { usedPercent: number; resetsAt: number | null } | null,
): ClaudeRateLimitWindow | null {
  return w ? { used_percent: w.usedPercent, resets_at: w.resetsAt } : null;
}

export async function claudeRateLimitStatus(): Promise<ClaudeRateLimitStatus> {
  const s = await window.api.usage.claudeRateLimitStatus();
  return { five_hour: toRateLimitWindow(s.fiveHour), seven_day: toRateLimitWindow(s.sevenDay) };
}

export async function cursorUsageStatus(): Promise<CursorUsageStatus> {
  const s = await window.api.usage.cursorUsageStatus();
  return {
    auto_percent_used: s.autoPercentUsed,
    api_percent_used: s.apiPercentUsed,
    total_percent_used: s.totalPercentUsed,
    billing_cycle_end_ms: s.billingCycleEndMs,
  };
}

function toCodexWindow(
  w: { usedPercent: number; resetsAt: number | null; windowMinutes: number | null } | null,
): CodexRateLimitWindow | null {
  return w
    ? { used_percent: w.usedPercent, resets_at: w.resetsAt, window_minutes: w.windowMinutes }
    : null;
}

export async function codexRateLimitStatus(): Promise<CodexRateLimitStatus> {
  const s = await window.api.usage.codexRateLimitStatus();
  return {
    plan_type: s.planType,
    session: toCodexWindow(s.session),
    weekly: toCodexWindow(s.weekly),
    error: s.error,
  };
}

export async function loadUsageMeterSettings(): Promise<UsageMeterSettings> {
  const raw = await window.api.usage.meterSettingsGet();
  return normalizeUsageMeterSettings(raw);
}

export async function saveUsageMeterSettings(settings: UsageMeterSettings): Promise<void> {
  await window.api.usage.meterSettingsSave(settings);
}
