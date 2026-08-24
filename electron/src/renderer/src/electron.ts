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
  data_b64: string;
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
  return window.api.pty.onData((id, data) => {
    handler({ id, data_b64: bytesToBase64(data) });
  });
}
