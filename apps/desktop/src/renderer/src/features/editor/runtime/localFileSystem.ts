/** Desktop IPC adapter for the local Editor provider's filesystem capability. */

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  is_ignored?: boolean
}

function toDirEntry(e: {
  name: string
  path: string
  isDir: boolean
  isIgnored: boolean
}): DirEntry {
  return { name: e.name, path: e.path, is_dir: e.isDir, is_ignored: e.isIgnored }
}

export async function listDir(
  tabId: number,
  path: string,
  expectedRootPath?: string
): Promise<DirEntry[]> {
  const entries = await window.api.fs.listDir(tabId, path, expectedRootPath)
  return entries.map(toDirEntry)
}

/** null when the file no longer exists — see main/files.ts readFileIfExists. */
export async function readFile(
  tabId: number,
  path: string,
  expectedRootPath?: string
): Promise<string | null> {
  return window.api.fs.readFile(tabId, path, expectedRootPath)
}

export async function readFileBinaryPreview(
  tabId: number,
  path: string
): Promise<{ content: string; mimeType: string } | null> {
  return window.api.fs.readFileBinaryPreview(tabId, path)
}

export async function writeFile(
  tabId: number,
  path: string,
  content: string,
  expectedRootPath?: string
): Promise<void> {
  return window.api.fs.writeFile(tabId, path, content, expectedRootPath)
}

export async function writeFileIfUnchanged(
  tabId: number,
  path: string,
  expected: string,
  content: string,
  expectedRootPath?: string
): Promise<boolean> {
  return window.api.fs.writeFileIfUnchanged(tabId, path, expected, content, expectedRootPath)
}

export async function createDir(
  tabId: number,
  path: string,
  expectedRootPath?: string
): Promise<void> {
  return window.api.fs.createDir(tabId, path, expectedRootPath)
}

export async function deletePath(
  tabId: number,
  path: string,
  expectedRootPath?: string
): Promise<void> {
  return window.api.fs.deletePath(tabId, path, expectedRootPath)
}

export async function renamePath(
  tabId: number,
  from: string,
  to: string,
  expectedRootPath?: string
): Promise<void> {
  return window.api.fs.renamePath(tabId, from, to, expectedRootPath)
}

// No legacy Tauri precedent for search, so this API keeps plain camelCase.
export interface SearchOptions {
  caseSensitive?: boolean
  regex?: boolean
  wholeWord?: boolean
  includeHidden?: boolean
}

export interface SearchMatch {
  lineNumber: number
  lineText: string
  ranges: { start: number; end: number }[]
}

export interface SearchFileResult {
  path: string
  matches: SearchMatch[]
}

export function searchInFiles(
  requestId: string,
  tabId: number,
  query: string,
  opts: SearchOptions,
  expectedRootPath?: string
): void {
  window.api.fs.searchInFiles(requestId, tabId, query, opts, expectedRootPath)
}

export function cancelSearch(requestId: string): void {
  window.api.fs.searchCancel(requestId)
}

export function onSearchResult(
  handler: (requestId: string, result: SearchFileResult) => void
): () => void {
  return window.api.fs.onSearchResult(handler)
}

export function onSearchDone(handler: (requestId: string, error?: string) => void): () => void {
  return window.api.fs.onSearchDone(handler)
}

export async function listAllFiles(tabId: number, expectedRootPath?: string): Promise<string[]> {
  return window.api.fs.listAllFiles(tabId, expectedRootPath)
}

export function onFileChanged(handler: (paths: string[]) => void): () => void {
  return window.api.fs.onChanged(handler)
}
