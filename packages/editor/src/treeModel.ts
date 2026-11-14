export interface EditorTreeBranchEntry {
  path: string
  name: string
  directory: boolean
}

export interface EditorVisibleTreeRow<T extends EditorTreeBranchEntry> {
  item: T
  depth: number
}

export const EDITOR_TREE_ROW_HEIGHT = 27
const TREE_OVERSCAN = 4

/** Keep Markdown labels consistent across provider-backed file trees. */
export function editorTreeItemLabel(name: string, kind: string): string {
  return kind === 'markdown' ? name.replace(/\.(?:md|markdown)$/i, '') : name
}

export interface EditorTreeProjection<T> {
  rows: T[]
  startIndex: number
  paddingTop: number
  paddingBottom: number
  totalHeight: number
}

/** Window the common tree row list for large directories. */
export function projectEditorTreeRows<T>(
  rows: T[],
  scrollTop: number,
  viewportHeight: number,
  rowHeight = EDITOR_TREE_ROW_HEIGHT
): EditorTreeProjection<T> {
  const totalHeight = rows.length * rowHeight
  if (viewportHeight <= 0 || rows.length === 0) {
    return { rows, startIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight }
  }
  const count = Math.ceil(viewportHeight / rowHeight) + TREE_OVERSCAN * 2
  // The tree can shrink after a rename, folder collapse, filter change, or
  // workspace restore while its old scroll offset is still being reconciled.
  // Clamp the window to the remaining rows so a stale offset never projects
  // an empty slice for a non-empty tree (which looks like an empty folder).
  const maxStartIndex = Math.max(0, rows.length - count)
  const startIndex = Math.min(
    maxStartIndex,
    Math.max(0, Math.floor(scrollTop / rowHeight) - TREE_OVERSCAN)
  )
  const end = Math.min(rows.length, startIndex + count)
  return {
    rows: rows.slice(startIndex, end),
    startIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, (rows.length - end) * rowHeight),
    totalHeight
  }
}

/** Flatten loaded branches with the shared Workspace tree ordering. */
export function flattenEditorTree<T extends EditorTreeBranchEntry>(
  branches: ReadonlyMap<string, readonly T[]>,
  expanded: ReadonlySet<string>,
  root = ''
): EditorVisibleTreeRow<T>[] {
  const rows: EditorVisibleTreeRow<T>[] = []
  const visit = (parent: string, depth: number, ancestors: ReadonlySet<string>) => {
    const children = [...(branches.get(parent) ?? [])].sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
    for (const item of children) {
      rows.push({ item, depth })
      if (item.directory && expanded.has(item.path) && !ancestors.has(item.path)) {
        visit(item.path, depth + 1, new Set(ancestors).add(item.path))
      }
    }
  }
  visit(root, 0, new Set())
  return rows
}
