import { useCallback, useState } from "react";
import { resolveEditorTreeSelection } from "./treeSelection";

/** Owns the common focused/anchor/multi-selection transition state for a tree host. */
export function useEditorTreeSelection(paths: readonly string[]) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);

  const select = useCallback((path: string, focusedPath: string | null, modifiers?: { additive?: boolean; range?: boolean }) => {
    const next = resolveEditorTreeSelection(paths, { focusedPath, anchorPath, selectedPaths }, path, modifiers);
    setSelectedPaths(new Set(next.selectedPaths));
    setAnchorPath(next.anchorPath);
    return next;
  }, [paths, anchorPath, selectedPaths]);

  const clear = useCallback(() => {
    setSelectedPaths(new Set());
    setAnchorPath(null);
  }, []);

  return { selectedPaths, setSelectedPaths, anchorPath, setAnchorPath, select, clear };
}
