/** Sidebar chrome keyed by pane group (flexlayout tab node) — each split
 * gets its own independent tree open/width/mode, not one shared across the
 * whole workspace tab. Key shape comes from paneTabStoreKey(). */

const TREE_OPEN_KEY = 'workspace.editorTreeOpen'
const TREE_WIDTH_KEY = 'workspace.editorTreeWidth'
const SIDEBAR_MODE_KEY = 'workspace.sidebarMode'

export type SidebarMode = 'explorer' | 'search'

function openKey(paneKey: string): string {
  return `${TREE_OPEN_KEY}.${paneKey}`
}

function widthKey(paneKey: string): string {
  return `${TREE_WIDTH_KEY}.${paneKey}`
}

function modeKey(paneKey: string): string {
  return `${SIDEBAR_MODE_KEY}.${paneKey}`
}

export function getStoredSidebarMode(paneKey: string): SidebarMode {
  return localStorage.getItem(modeKey(paneKey)) === 'search' ? 'search' : 'explorer'
}

export function getStoredTreeOpen(paneKey: string): boolean {
  const stored = localStorage.getItem(openKey(paneKey))
  return stored === null ? true : stored === '1'
}

export function getStoredTreeWidth(paneKey: string): number {
  const stored = Number(localStorage.getItem(widthKey(paneKey)))
  return Number.isFinite(stored) && stored > 0 ? stored : 200
}

export function setStoredTreeOpen(paneKey: string, open: boolean): void {
  localStorage.setItem(openKey(paneKey), open ? '1' : '0')
}

export function setStoredTreeWidth(paneKey: string, width: number): void {
  localStorage.setItem(widthKey(paneKey), String(width))
}

export function setStoredSidebarMode(paneKey: string, mode: SidebarMode): void {
  localStorage.setItem(modeKey(paneKey), mode)
}
