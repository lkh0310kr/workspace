/** Per-pane Editor tree UI state (expand + scroll), keyed by workspaceTabId:flexlayoutNodeId. */

export interface EditorTreeState {
  rootPath: string
  expanded: string[]
  scrollTop: number
  scrollAnchorPath?: string
  scrollAnchorOffset?: number
}

/** Resolve a saved row anchor after tree data is ready, falling back to its pixel offset. */
export function resolveEditorTreeScrollTop(
  state: Pick<EditorTreeState, 'scrollTop' | 'scrollAnchorPath' | 'scrollAnchorOffset'>,
  visiblePaths: readonly string[],
  maxScrollTop: number,
  rowHeight: number
): number {
  const anchorIndex = state.scrollAnchorPath ? visiblePaths.indexOf(state.scrollAnchorPath) : -1
  const target =
    anchorIndex >= 0 ? anchorIndex * rowHeight + (state.scrollAnchorOffset ?? 0) : state.scrollTop
  return Math.max(0, Math.min(target, Math.max(0, maxScrollTop)))
}

const session = new Map<string, EditorTreeState>()
const EXPANDED_KEY = 'workspace.editorTreeExpanded'
const SCROLL_KEY = 'workspace.editorTreeScroll'
const ROOT_KEY = 'workspace.editorTreeRoot'
// These persisted keys are retained only to migrate prior Editor tree state.
const LEGACY_EXPANDED_KEY = 'workspace.explorerExpanded'
const LEGACY_SCROLL_KEY = 'workspace.explorerScroll'
const LEGACY_ROOT_KEY = 'workspace.explorerRoot'

function expandedStorageKey(stateKey: string): string {
  return `${EXPANDED_KEY}.${stateKey}`
}

function scrollStorageKey(stateKey: string): string {
  return `${SCROLL_KEY}.${stateKey}`
}

function rootStorageKey(stateKey: string): string {
  return `${ROOT_KEY}.${stateKey}`
}

function migrateLegacyStorage(stateKey: string): void {
  try {
    if (localStorage.getItem(rootStorageKey(stateKey)) !== null) return
    const legacyRootKey = `${LEGACY_ROOT_KEY}.${stateKey}`
    const legacyRoot = localStorage.getItem(legacyRootKey)
    if (legacyRoot === null) return

    const keys = [
      [`${EXPANDED_KEY}.${stateKey}`, `${LEGACY_EXPANDED_KEY}.${stateKey}`],
      [`${SCROLL_KEY}.${stateKey}`, `${LEGACY_SCROLL_KEY}.${stateKey}`],
      [`${SCROLL_KEY}.${stateKey}.anchor`, `${LEGACY_SCROLL_KEY}.${stateKey}.anchor`]
    ] as const
    for (const [nextKey, oldKey] of keys) {
      const value = localStorage.getItem(oldKey)
      if (value !== null) localStorage.setItem(nextKey, value)
    }
    localStorage.setItem(rootStorageKey(stateKey), legacyRoot)
    for (const [, oldKey] of keys) localStorage.removeItem(oldKey)
    localStorage.removeItem(legacyRootKey)
  } catch {
    // Keep legacy state intact if storage migration cannot complete.
  }
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

export function loadEditorTreeState(stateKey: string, rootPath: string): EditorTreeState {
  migrateLegacyStorage(stateKey)
  const cached = session.get(stateKey)
  if (cached && cached.rootPath === rootPath) return cached
  const next: EditorTreeState = {
    rootPath,
    expanded: readExpanded(stateKey, rootPath),
    scrollTop: readScroll(stateKey, rootPath),
    scrollAnchorPath: readScrollAnchor(stateKey, rootPath)?.path,
    scrollAnchorOffset: readScrollAnchor(stateKey, rootPath)?.offset
  }
  session.set(stateKey, next)
  return next
}

export function saveEditorTreeExpanded(
  stateKey: string,
  rootPath: string,
  expanded: Iterable<string>
): void {
  const list = [...expanded]
  const next: EditorTreeState = {
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

export function saveEditorTreeScrollTop(stateKey: string, rootPath: string, scrollTop: number): void {
  const prev = session.get(stateKey)
  const next: EditorTreeState = {
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

export function saveEditorTreeScrollAnchor(
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
  const current = session.get(stateKey) ?? loadEditorTreeState(stateKey, rootPath)
  session.set(stateKey, {
    ...current,
    rootPath,
    scrollAnchorPath: path,
    scrollAnchorOffset: path ? Math.max(0, offset) : undefined
  })
}

export function resetEditorTreeState(stateKey: string, rootPath: string): EditorTreeState {
  const next: EditorTreeState = { rootPath, expanded: [], scrollTop: 0 }
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
