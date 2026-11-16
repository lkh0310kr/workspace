/** Sidebar chrome keyed by pane group (flexlayout tab node) — each split
 * gets its own independent tree open/width/mode, not one shared across the
 * whole workspace tab. Key shape comes from paneTabStoreKey(). */

const TREE_OPEN_KEY = 'workspace.editorTreeOpen'
const TREE_WIDTH_KEY = 'workspace.editorTreeWidth'
const SIDEBAR_MODE_KEY = 'workspace.sidebarMode'

export type EditorSidebarMode = 'tree' | 'search'

function openKey(paneKey: string): string {
  return `${TREE_OPEN_KEY}.${paneKey}`
}

function widthKey(paneKey: string): string {
  return `${TREE_WIDTH_KEY}.${paneKey}`
}

function modeKey(paneKey: string): string {
  return `${SIDEBAR_MODE_KEY}.${paneKey}`
}

export function getStoredEditorSidebarMode(paneKey: string): EditorSidebarMode {
  return localStorage.getItem(modeKey(paneKey)) === 'search' ? 'search' : 'tree'
}

export function getStoredEditorTreeOpen(paneKey: string): boolean {
  const stored = localStorage.getItem(openKey(paneKey))
  return stored === null ? true : stored === '1'
}

export function getStoredEditorTreeWidth(paneKey: string): number {
  const stored = Number(localStorage.getItem(widthKey(paneKey)))
  return Number.isFinite(stored) && stored > 0 ? stored : 262
}

export function setStoredEditorTreeOpen(paneKey: string, open: boolean): void {
  localStorage.setItem(openKey(paneKey), open ? '1' : '0')
}

export function setStoredEditorTreeWidth(paneKey: string, width: number): void {
  localStorage.setItem(widthKey(paneKey), String(width))
}

export function setStoredEditorSidebarMode(paneKey: string, mode: EditorSidebarMode): void {
  localStorage.setItem(modeKey(paneKey), mode)
}
