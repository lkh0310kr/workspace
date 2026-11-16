import { useCallback, useState } from 'react'
import {
  getStoredEditorSidebarMode,
  getStoredEditorTreeOpen,
  getStoredEditorTreeWidth,
  setStoredEditorSidebarMode,
  setStoredEditorTreeOpen,
  setStoredEditorTreeWidth,
  type EditorSidebarMode
} from './editorSidebarState'

export interface EditorSidebarState {
  treeOpen: boolean
  treeWidth: number
  sidebarMode: EditorSidebarMode
  setTreeOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  setTreeWidth: (next: number | ((prev: number) => number)) => void
  setSidebarMode: (mode: EditorSidebarMode) => void
}

/** Editor tree/search chrome state for one pane identity supplied by the host. */
export function useEditorSidebarState(paneKey: string): EditorSidebarState {
  const [treeOpen, setTreeOpenState] = useState(() => getStoredEditorTreeOpen(paneKey))
  const [treeWidth, setTreeWidthState] = useState(() => getStoredEditorTreeWidth(paneKey))
  const [sidebarMode, setSidebarModeState] = useState<EditorSidebarMode>(() => getStoredEditorSidebarMode(paneKey))

  const setTreeOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setTreeOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      setStoredEditorTreeOpen(paneKey, value)
      return value
    })
  }, [paneKey])

  const setTreeWidth = useCallback((next: number | ((prev: number) => number)) => {
    setTreeWidthState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      setStoredEditorTreeWidth(paneKey, value)
      return value
    })
  }, [paneKey])

  const setSidebarMode = useCallback((mode: EditorSidebarMode) => {
    setStoredEditorSidebarMode(paneKey, mode)
    setSidebarModeState(mode)
  }, [paneKey])

  return { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode }
}
