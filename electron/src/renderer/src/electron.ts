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

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

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

function toDirEntry(e: { name: string; path: string; isDir: boolean }): DirEntry {
  return { name: e.name, path: e.path, is_dir: e.isDir };
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

export async function spawnTerminal(cols = 120, rows = 40): Promise<number> {
  return window.api.pty.spawn(cols, rows);
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

export async function setTabLayout(tabId: number, layoutJson: string): Promise<void> {
  return window.api.workspace.setTabLayout(tabId, layoutJson);
}

export async function setTabRootPath(tabId: number, path: string): Promise<WorkspaceState> {
  return toWorkspaceState(await window.api.workspace.setTabRootPath(tabId, path));
}

export async function listDir(tabId: number, path: string): Promise<DirEntry[]> {
  const entries = await window.api.fs.listDir(tabId, path);
  return entries.map(toDirEntry);
}

export async function readFile(tabId: number, path: string): Promise<string> {
  return window.api.fs.readFile(tabId, path);
}

export async function readFileBinaryPreview(
  tabId: number,
  path: string,
): Promise<{ content: string; mimeType: string } | null> {
  return window.api.fs.readFileBinaryPreview(tabId, path);
}

export async function writeFile(tabId: number, path: string, content: string): Promise<void> {
  return window.api.fs.writeFile(tabId, path, content);
}

export async function createDir(tabId: number, path: string): Promise<void> {
  return window.api.fs.createDir(tabId, path);
}

export async function deletePath(tabId: number, path: string): Promise<void> {
  return window.api.fs.deletePath(tabId, path);
}

export async function renamePath(tabId: number, from: string, to: string): Promise<void> {
  return window.api.fs.renamePath(tabId, from, to);
}

// No legacy Tauri precedent for search — plain camelCase, not the
// snake_case porting convention this file otherwise follows.
export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  includeHidden?: boolean;
}

export interface SearchMatch {
  lineNumber: number;
  lineText: string;
  ranges: { start: number; end: number }[];
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export function searchInFiles(
  requestId: string,
  tabId: number,
  query: string,
  opts: SearchOptions,
): void {
  window.api.fs.searchInFiles(requestId, tabId, query, opts);
}

export function cancelSearch(requestId: string): void {
  window.api.fs.searchCancel(requestId);
}

export function onSearchResult(
  handler: (requestId: string, result: SearchFileResult) => void,
): () => void {
  return window.api.fs.onSearchResult(handler);
}

export function onSearchDone(handler: (requestId: string, error?: string) => void): () => void {
  return window.api.fs.onSearchDone(handler);
}

export async function listAllFiles(tabId: number): Promise<string[]> {
  return window.api.fs.listAllFiles(tabId);
}

export async function getMediaUrl(tabId: number, path: string): Promise<string | null> {
  return window.api.media.getUrl(tabId, path);
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

export function epubResourceUrl(bookId: string, href: string): string {
  return `workspace-epub://${bookId}/${href}`;
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

export function onFileChanged(handler: () => void): () => void {
  return window.api.fs.onChanged(handler);
}

export async function revealItemInDir(path: string): Promise<void> {
  return window.api.shell.revealItemInDir(path);
}

// Tauri's @tauri-apps/plugin-dialog open({ directory: true }) equivalent —
// a native directory picker, routed through the main process since
// Electron's dialog module only exists there.
export async function openDirectoryDialog(defaultPath?: string): Promise<string | null> {
  return window.api.dialog.openDirectory(defaultPath);
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
