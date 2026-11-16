import { useCallback, useState } from 'react'
import { resolveEditorTreeSelection } from './treeSelection'

/** Owns the common focused/anchor/multi-selection transition state for a tree host. */
export function useEditorTreeSelection(paths: readonly string[]) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [anchorPath, setAnchorPath] = useState<string | null>(null)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  const select = useCallback(
    (
      path: string,
      focusedPathOverride: string | null | undefined = focusedPath,
      modifiers?: { additive?: boolean; range?: boolean }
    ) => {
      const next = resolveEditorTreeSelection(
        paths,
        { focusedPath: focusedPathOverride, anchorPath, selectedPaths },
        path,
        modifiers
      )
      setSelectedPaths(new Set(next.selectedPaths))
      setAnchorPath(next.anchorPath)
      setFocusedPath(next.focusedPath)
      return next
    },
    [paths, anchorPath, selectedPaths, focusedPath]
  )

  const selectRow = useCallback(
    (path: string, index: number, additive = false, range = false) => {
      const targetPath = paths[index] === path ? path : paths.find((rowPath) => rowPath === path)
      if (!targetPath) return
      return select(targetPath, focusedPath, { additive, range })
    },
    [paths, focusedPath, select]
  )

  const clear = useCallback(() => {
    setSelectedPaths(new Set())
    setAnchorPath(null)
    setFocusedPath(null)
  }, [])

  return {
    selectedPaths,
    setSelectedPaths,
    anchorPath,
    setAnchorPath,
    focusedPath,
    setFocusedPath,
    select,
    selectRow,
    clear
  }
}
