import { useCallback, useState } from 'react'
import {
  getStoredSidebarMode,
  getStoredTreeOpen,
  getStoredTreeWidth,
  setStoredSidebarMode,
  setStoredTreeOpen,
  setStoredTreeWidth,
  type SidebarMode
} from '../explorer/explorerSidebarChrome'
import { paneTabStoreKey } from '../store/paneTabKey'

export interface PaneGroupExplorerChrome {
  treeOpen: boolean
  treeWidth: number
  sidebarMode: SidebarMode
  setTreeOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  setTreeWidth: (next: number | ((prev: number) => number)) => void
  setSidebarMode: (mode: SidebarMode) => void
}

/** Tree open/width/search-vs-explorer state, one per pane group (flexlayout
 * tab node) — each split keeps its own, so splitting the layout shows an
 * independent tree per split instead of one shared across the whole
 * workspace tab. */
export function usePaneGroupExplorerChrome(
  workspaceTabId: number,
  nodeId: string
): PaneGroupExplorerChrome {
  const key = paneTabStoreKey(workspaceTabId, nodeId)
  const [treeOpen, setTreeOpenState] = useState(() => getStoredTreeOpen(key))
  const [treeWidth, setTreeWidthState] = useState(() => getStoredTreeWidth(key))
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>(() => getStoredSidebarMode(key))

  const setTreeOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setTreeOpenState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        setStoredTreeOpen(key, value)
        return value
      })
    },
    [key]
  )

  const setTreeWidth = useCallback(
    (next: number | ((prev: number) => number)) => {
      setTreeWidthState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        setStoredTreeWidth(key, value)
        return value
      })
    },
    [key]
  )

  const setSidebarMode = useCallback(
    (mode: SidebarMode) => {
      setStoredSidebarMode(key, mode)
      setSidebarModeState(mode)
    },
    [key]
  )

  return { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode }
}
