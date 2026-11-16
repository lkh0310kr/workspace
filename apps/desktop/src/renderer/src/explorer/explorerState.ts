/** Per-pane explorer tree UI state (expand + scroll), keyed by workspaceTabId:flexlayoutNodeId. */

export interface ExplorerTreeState {
  rootPath: string
  expanded: string[]
  scrollTop: number
  scrollAnchorPath?: string
  scrollAnchorOffset?: number
}

/** Resolve a saved row anchor after tree data is ready, falling back to its pixel offset. */
export function resolveExplorerScrollTop(
  state: Pick<ExplorerTreeState, 'scrollTop' | 'scrollAnchorPath' | 'scrollAnchorOffset'>,
  visiblePaths: readonly string[],
  maxScrollTop: number,
  rowHeight: number
): number {
  const anchorIndex = state.scrollAnchorPath ? visiblePaths.indexOf(state.scrollAnchorPath) : -1
  const target =
    anchorIndex >= 0 ? anchorIndex * rowHeight + (state.scrollAnchorOffset ?? 0) : state.scrollTop
  return Math.max(0, Math.min(target, Math.max(0, maxScrollTop)))
}

const session = new Map<string, ExplorerTreeState>()
const EXPANDED_KEY = 'workspace.explorerExpanded'
const SCROLL_KEY = 'workspace.explorerScroll'
const ROOT_KEY = 'workspace.explorerRoot'

function expandedStorageKey(stateKey: string): string {
  return `${EXPANDED_KEY}.${stateKey}`
}

function scrollStorageKey(stateKey: string): string {
  return `${SCROLL_KEY}.${stateKey}`
}

function rootStorageKey(stateKey: string): string {
  return `${ROOT_KEY}.${stateKey}`
}

function readExpanded(stateKey: string, rootPath: string): string[] {
  try {
    if (localStorage.getItem(rootStorageKey(stateKey)) !== rootPath) return []
    const raw = localStorage.getItem(expandedStorageKey(stateKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function readScroll(stateKey: string, rootPath: string): number {
  if (localStorage.getItem(rootStorageKey(stateKey)) !== rootPath) return 0
  const raw = Number(localStorage.getItem(scrollStorageKey(stateKey)))
  return Number.isFinite(raw) && raw >= 0 ? raw : 0
}

export function loadExplorerTreeState(stateKey: string, rootPath: string): ExplorerTreeState {
  const cached = session.get(stateKey)
  if (cached && cached.rootPath === rootPath) return cached
  const next: ExplorerTreeState = {
    rootPath,
    expanded: readExpanded(stateKey, rootPath),
    scrollTop: readScroll(stateKey, rootPath),
    scrollAnchorPath: readScrollAnchor(stateKey, rootPath)?.path,
    scrollAnchorOffset: readScrollAnchor(stateKey, rootPath)?.offset
  }
  session.set(stateKey, next)
  return next
}

export function saveExplorerExpanded(
  stateKey: string,
  rootPath: string,
  expanded: Iterable<string>
): void {
  const list = [...expanded]
  const next: ExplorerTreeState = {
    rootPath,
    expanded: list,
    scrollTop: session.get(stateKey)?.scrollTop ?? readScroll(stateKey, rootPath),
    scrollAnchorPath: session.get(stateKey)?.scrollAnchorPath,
    scrollAnchorOffset: session.get(stateKey)?.scrollAnchorOffset
  }
  session.set(stateKey, next)
  try {
    localStorage.setItem(rootStorageKey(stateKey), rootPath)
    localStorage.setItem(expandedStorageKey(stateKey), JSON.stringify(list))
  } catch {
    // ignore quota errors
  }
}

export function saveExplorerScrollTop(stateKey: string, rootPath: string, scrollTop: number): void {
  const prev = session.get(stateKey)
  const next: ExplorerTreeState = {
    rootPath,
    expanded: prev?.expanded ?? readExpanded(stateKey, rootPath),
    scrollTop,
    scrollAnchorPath: prev?.scrollAnchorPath,
    scrollAnchorOffset: prev?.scrollAnchorOffset
  }
  session.set(stateKey, next)
  try {
    localStorage.setItem(rootStorageKey(stateKey), rootPath)
    localStorage.setItem(scrollStorageKey(stateKey), String(scrollTop))
  } catch {
    // ignore
  }
}

function readScrollAnchor(
  stateKey: string,
  rootPath: string
): { path: string; offset: number } | undefined {
  try {
    if (localStorage.getItem(rootStorageKey(stateKey)) !== rootPath) return undefined
    const raw = localStorage.getItem(`${SCROLL_KEY}.${stateKey}.anchor`)
    if (!raw) return undefined
    const value = JSON.parse(raw) as { path?: unknown; offset?: unknown }
    if (
      typeof value.path !== 'string' ||
      typeof value.offset !== 'number' ||
      !Number.isFinite(value.offset)
    )
      return undefined
    return { path: value.path, offset: Math.max(0, value.offset) }
  } catch {
    return undefined
  }
}

export function saveExplorerScrollAnchor(
  stateKey: string,
  rootPath: string,
  path: string | undefined,
  offset = 0
): void {
  try {
    if (path)
      localStorage.setItem(
        `${SCROLL_KEY}.${stateKey}.anchor`,
        JSON.stringify({ path, offset: Math.max(0, offset) })
      )
    else localStorage.removeItem(`${SCROLL_KEY}.${stateKey}.anchor`)
  } catch {
    // ignore quota errors
  }
  const current = session.get(stateKey) ?? loadExplorerTreeState(stateKey, rootPath)
  session.set(stateKey, {
    ...current,
    rootPath,
    scrollAnchorPath: path,
    scrollAnchorOffset: path ? Math.max(0, offset) : undefined
  })
}

export function resetExplorerTreeState(stateKey: string, rootPath: string): ExplorerTreeState {
  const next: ExplorerTreeState = { rootPath, expanded: [], scrollTop: 0 }
  session.set(stateKey, next)
  try {
    localStorage.removeItem(expandedStorageKey(stateKey))
    localStorage.removeItem(scrollStorageKey(stateKey))
    localStorage.removeItem(`${SCROLL_KEY}.${stateKey}.anchor`)
    localStorage.removeItem(rootStorageKey(stateKey))
  } catch {
    // ignore
  }
  return next
}

/** Parent directory paths to expand so `relativePath` is visible (excluding the file itself). */
export function ancestorDirPaths(relativePath: string): string[] {
  if (!relativePath) return []
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const out: string[] = []
  let acc = ''
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i]
    out.push(acc)
  }
  return out
}
