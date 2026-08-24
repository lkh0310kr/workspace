import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
  data_b64: string;
}

export interface BrowserLoading {
  paneId: string;
  loading: boolean;
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  return invoke("get_workspace_state");
}

export async function hostname(): Promise<string> {
  return invoke("hostname");
}

export async function debugLog(line: string): Promise<void> {
  return invoke("debug_log", { line });
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export async function claudeCodeUsageRecent(): Promise<ClaudeUsage> {
  return invoke("claude_code_usage_recent");
}

export interface ClaudeRateLimitWindow {
  used_percent: number;
  resets_at: number | null;
}

export interface ClaudeRateLimitStatus {
  five_hour: ClaudeRateLimitWindow | null;
  seven_day: ClaudeRateLimitWindow | null;
}

export async function claudeRateLimitStatus(): Promise<ClaudeRateLimitStatus> {
  return invoke("claude_rate_limit_status");
}

export interface CursorUsageStatus {
  auto_percent_used: number | null;
  api_percent_used: number | null;
  total_percent_used: number | null;
  billing_cycle_end_ms: number | null;
}

export async function cursorUsageStatus(): Promise<CursorUsageStatus> {
  return invoke("cursor_usage_status");
}

export async function ptyWrite(id: number, data: Uint8Array): Promise<void> {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const data_b64 = btoa(binary);
  return invoke("pty_write", { id, dataB64: data_b64 });
}

export async function ptyResize(id: number, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { id, cols, rows });
}

export async function spawnTerminal(cols = 120, rows = 40): Promise<number> {
  return invoke("spawn_terminal", { cols, rows });
}

export async function addTab(): Promise<number> {
  return invoke("add_tab");
}

export async function closeTab(tabId: number): Promise<void> {
  return invoke("close_tab", { tabId });
}

export async function selectTab(tabId: number): Promise<void> {
  return invoke("select_tab", { tabId });
}

export async function setTabLayout(tabId: number, layoutJson: string): Promise<void> {
  return invoke("set_tab_layout", { tabId, layoutJson });
}

export async function setTabRootPath(tabId: number, path: string): Promise<WorkspaceState> {
  return invoke("set_tab_root_path", { tabId, path });
}

export async function listDir(tabId: number, path: string): Promise<DirEntry[]> {
  return invoke("list_dir", { tabId, path });
}

export async function readFile(tabId: number, path: string): Promise<string> {
  return invoke("read_file", { tabId, path });
}

export async function writeFile(tabId: number, path: string, content: string): Promise<void> {
  return invoke("write_file", { tabId, path, content });
}

export async function createDir(tabId: number, path: string): Promise<void> {
  return invoke("create_dir", { tabId, path });
}

export async function deletePath(tabId: number, path: string): Promise<void> {
  return invoke("delete_path", { tabId, path });
}

export async function renamePath(tabId: number, from: string, to: string): Promise<void> {
  return invoke("rename_path", { tabId, from, to });
}

export function onPtyOutput(handler: (payload: PtyOutput) => void) {
  return listen<PtyOutput>("pty-output", (e) => handler(e.payload));
}

export function onWorkspaceUpdated(handler: (state: WorkspaceState) => void) {
  return listen<WorkspaceState>("workspace-updated", (e) => handler(e.payload));
}

export function onFileChanged(handler: () => void) {
  return listen("file-changed", () => handler());
}

export function onAppReady(handler: () => void) {
  return listen("app-ready", () => handler());
}

export function onBrowserLoading(handler: (payload: BrowserLoading) => void) {
  return listen<BrowserLoading>("browser-loading", (e) => handler(e.payload));
}
