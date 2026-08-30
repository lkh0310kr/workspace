// Renderer-side API shim, deliberately shaped to match the Tauri app's
// ui/src/tauri.ts export surface (same function names, same snake_case
// field names on TabInfo/WorkspaceState/DirEntry) even though the IPC
// layer underneath (window.api, from preload/index.ts) uses camelCase.
// The point is to let App.tsx/WorkspaceTabRail.tsx/panes/etc. be ported
// with import-path-only changes instead of a field-name rewrite
// throughout every consumer.

export interface TabInfo {
  id: number;
  title: string;
  layout_json: string;
  root_path: string;
}

export interface WorkspaceState {
  tabs: TabInfo[];
  active_tab_id: number;
}

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

interface RawTabInfo {
  id: number;
  title: string;
  layoutJson: string;
  rootPath: string;
}

interface RawWorkspaceState {
  tabs: RawTabInfo[];
  activeTabId: number;
}

function toTabInfo(t: RawTabInfo): TabInfo {
  return { id: t.id, title: t.title, layout_json: t.layoutJson, root_path: t.rootPath };
}

function toWorkspaceState(s: RawWorkspaceState): WorkspaceState {
  return { tabs: s.tabs.map(toTabInfo), active_tab_id: s.activeTabId };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  return toWorkspaceState(await window.api.workspace.getState());
}

export async function hostname(): Promise<string> {
  return window.api.hostname();
}

// No main-process debug-log sink ported yet (this backed the Hangul IME
// trace instrumentation on the Tauri side, deliberately not carried over
// — see TerminalPane.tsx). Kept as a no-op rather than removed from every
// call site so future debugging can reuse the same call shape.
export async function debugLog(_line: string): Promise<void> {}

export async function ptyWrite(id: number, data: Uint8Array): Promise<void> {
  window.api.pty.write(id, data);
}

export async function ptyResize(id: number, cols: number, rows: number): Promise<void> {
  window.api.pty.resize(id, cols, rows);
}

export async function spawnTerminal(cols = 120, rows = 40, tabId?: number): Promise<number> {
  return window.api.pty.spawn(cols, rows, tabId);
}

export async function addTab(): Promise<number> {
  return window.api.workspace.addTab();
}

export async function closeTab(tabId: number): Promise<void> {
  return window.api.workspace.closeTab(tabId);
}

export async function selectTab(tabId: number): Promise<void> {
  return window.api.workspace.selectTab(tabId);
}

export async function renameTab(tabId: number, title: string): Promise<void> {
  return window.api.workspace.renameTab(tabId, title);
}

export async function reorderTabs(orderedIds: number[]): Promise<void> {
  return window.api.workspace.reorderTabs(orderedIds);
}

export async function setTabLayout(tabId: number, layoutJson: string): Promise<void> {
  return window.api.workspace.setTabLayout(tabId, layoutJson);
}

export async function setTabRootPath(tabId: number, path: string): Promise<WorkspaceState> {
  return toWorkspaceState(await window.api.workspace.setTabRootPath(tabId, path));
}

export async function getMediaUrl(tabId: number, path: string): Promise<string | null> {
  return window.api.media.getUrl(tabId, path);
}

export async function getMediaUrlAbsolute(absolutePath: string): Promise<string> {
  return window.api.media.getUrlAbsolute(absolutePath);
}

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string | null;
  contentSnippet: string | null;
}

export interface FeedResult {
  title: string;
  items: FeedItem[];
}

export async function fetchFeed(url: string): Promise<FeedResult> {
  return window.api.rss.fetchFeed(url);
}

import type {
  JapaneseDbStatus,
  JapaneseKanjiDetail,
  JapaneseLexemeDetail,
  JapaneseSearchResult,
  JapaneseStrokeData,
} from "../../shared/japaneseTypes";

export type {
  JapaneseDbStatus,
  JapaneseKanjiDetail,
  JapaneseLexemeDetail,
  JapaneseLexemeSummary,
  JapaneseSearchResult,
  JapaneseStrokeData,
} from "../../shared/japaneseTypes";

export async function getJapaneseDbStatus(): Promise<JapaneseDbStatus> {
  return window.api.japanese.dbStatus();
}

export async function searchJapanese(query: string, limit?: number): Promise<JapaneseSearchResult> {
  return window.api.japanese.search(query, limit);
}

export async function getJapaneseLexeme(entSeq: number): Promise<JapaneseLexemeDetail | null> {
  return window.api.japanese.getLexeme(entSeq);
}

export async function getJapaneseKanji(literal: string): Promise<JapaneseKanjiDetail | null> {
  return window.api.japanese.getKanji(literal);
}

export async function getJapaneseStrokes(literal: string): Promise<JapaneseStrokeData | null> {
  return window.api.japanese.getStrokes(literal);
}

export async function searchJapaneseByKanji(literal: string): Promise<JapaneseSearchResult> {
  return window.api.japanese.searchByKanji(literal);
}

export interface EpubSpineItem {
  href: string;
  mediaType: string;
}

export interface EpubBook {
  bookId: string;
  title: string;
  spine: EpubSpineItem[];
}

export async function openEpub(tabId: number, path: string): Promise<EpubBook> {
  return window.api.epub.open(tabId, path);
}

export async function openEpubAbsolute(absolutePath: string): Promise<EpubBook> {
  return window.api.epub.openAbsolute(absolutePath);
}

export function epubResourceUrl(bookId: string, href: string): string {
  return `workspace-epub://${bookId}/${href}`;
}

/** `rel` is a workspace-relative directory holding an already-built
 * engine Web export (index.html + siblings) — see
 * electron/src/main/engineBundleProtocol.ts. Consumed by TreeView's
 * "Open as App" (PaneGroup.tsx's onTreeOpenAsApp). */
export async function getEngineBundleUrl(
  tabId: number,
  rel: string,
  entry?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const raw: unknown = await window.api.engine.getBundleUrl(tabId, rel, entry);
  // Pre-0597baf main returned a URL string; renderer HMR can update before
  // electron-vite restarts the main process — normalize so Open as App still works.
  if (typeof raw === "string") {
    return { ok: true, url: raw };
  }
  if (raw && typeof raw === "object" && "ok" in raw) {
    const result = raw as { ok: boolean; url?: string; error?: string };
    if (result.ok && typeof result.url === "string") return { ok: true, url: result.url };
    return { ok: false, error: result.error ?? "unknown error" };
  }
  return { ok: false, error: "invalid engine:get-bundle-url response — restart npm run dev" };
}

/** `rel` is a workspace-relative Godot *project* directory. Exports its
 * Web preset (via the real `godot` CLI, main-process, async) and returns
 * the output directory's workspace-relative path on success — feed that
 * straight into getEngineBundleUrl. Consumed by TreeView's "Export &
 * Open as App" (PaneGroup.tsx's onTreeExportGodotWeb). */
export async function exportGodotWeb(
  tabId: number,
  rel: string,
): Promise<{ ok: boolean; outputRel?: string; error?: string }> {
  return window.api.engine.exportGodotWeb(tabId, rel);
}

/** `rel` is a workspace-relative directory holding a `world-engine.json`
 * scene file. Launches it as a new World Engine window — a separate
 * native process (see main/worldEngine.ts), not an embedded pane, so
 * there's no tab/URL to open here the way engine bundles or Godot
 * exports get one. Consumed by TreeView's "Open in World Engine". */
export async function launchWorldEngine(tabId: number, rel: string): Promise<{ ok: boolean; error?: string }> {
  return window.api.worldEngine.launch(tabId, rel);
}

/** Registers one app/document entry into the project manifest for
 * `tabId`'s workspace root — see main/projectManifest.ts. Fire-and-forget
 * from callers: a failed registration shouldn't block whatever action
 * (e.g. opening a tab) triggered it. */
export async function registerProjectApp(
  tabId: number,
  kind: string,
  rel: string,
  title?: string,
): Promise<void> {
  await window.api.project.registerApp(tabId, kind, rel, title);
}

// Tauri's onXxx helpers return a Promise<UnlistenFn> (listen() is async).
// Kept as sync-returning here (window.api's ipcRenderer.on wiring is
// synchronous), but callers that do `unlisten.then((fn) => fn())` still
// work fine against a plain function since `Promise.resolve(fn).then(...)`
// isn't required — callers are ported to call the returned function
// directly instead.
export function onWorkspaceUpdated(handler: (state: WorkspaceState) => void): () => void {
  return window.api.workspace.onUpdated((s) => handler(toWorkspaceState(s)));
}

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

/** Fires when a <webview> guest tries to open a new window (target=_blank,
 * window.open()) — main/index.ts denies the native window and forwards it
 * here instead. `hostWebContentsId` identifies which webview guest it
 * came from (matches Electron.WebviewTag.getWebContentsId()). */
export function onBrowserOpenNewTab(handler: (payload: { hostWebContentsId: number; url: string }) => void): () => void {
  return window.api.browser.onOpenNewTab(handler);
}

/** Fires when a <webview> guest's own content calls/exits the Fullscreen
 * API (document.requestFullscreen() — Godot's Web export template ships
 * an in-canvas fullscreen button that does this). Electron/Chromium
 * already makes the real OS window fullscreen for free; this is only
 * for reacting to it — e.g. hiding this app's own chrome so a hosted
 * game gets genuinely full-bleed screen space. Ported from itch.io's
 * desktop client (ref-proj/itch) — see main/index.ts's matching comment. */
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

/** Cmd+W — closes the active pane tab instead of the whole window. */
export function onClosePaneTabShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onClosePaneTab(handler);
}

export function onOpenSettingsShortcut(handler: () => void): () => void {
  return window.api.shortcuts.onOpenSettings(handler);
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
