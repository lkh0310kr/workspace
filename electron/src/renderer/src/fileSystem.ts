// File System module (Phase 1 foundation — see docs/ROADMAP.md and
// docs/architecture/08-context-modeling.md's Capability section). Every
// pane already went through this one shim rather than reimplementing IPC
// calls — what this file adds isn't new behavior, it's giving that
// cluster a real name and location instead of living undifferentiated
// inside electron.ts's 369-line grab-bag alongside PTY/workspace-tab/
// media/RSS/EPUB/engine-bundle/clipboard/shortcut/usage-stats code. Split
// out with zero behavior change: electron.ts re-exports everything here,
// so no existing `from "../electron"` import site needed to change —
// new code can import from here directly for a narrower, more honest
// dependency than "the whole app's IPC surface."
//
// Scope: workspace-relative file/directory read-write-watch-search, plus
// the native directory-picker dialog (arguably its own thing, but always
// used to answer "which directory" — the same question every other
// function here answers about an already-open workspace root).

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

function toDirEntry(e: { name: string; path: string; isDir: boolean }): DirEntry {
  return { name: e.name, path: e.path, is_dir: e.isDir };
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
// snake_case porting convention electron.ts otherwise follows for
// anything that existed on the Tauri side.
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

export function onFileChanged(handler: (paths: string[]) => void): () => void {
  return window.api.fs.onChanged(handler);
}

export async function revealItemInDir(path: string): Promise<void> {
  return window.api.shell.revealItemInDir(path);
}

// Tauri's @tauri-apps/plugin-dialog open({ directory: true }) equivalent —
// a native directory picker, routed through the main process since
// Electron's dialog module only exists there.
export async function openDirectoryDialog(defaultPath?: string): Promise<string | null> {
  const result = await window.api.dialog.openDirectory(defaultPath);
  if (result.ok) return result.path;
  if (!result.canceled && result.error) throw new Error(result.error);
  return null;
}
