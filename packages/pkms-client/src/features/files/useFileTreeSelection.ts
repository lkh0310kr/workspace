import { useCallback, useMemo, useState } from "react";
import { useEditorTreeSelection } from "@workspace/editor";
import type { TreeRow } from "../../domain/types";

export function useFileTreeSelection(rows: TreeRow[]) {
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const paths = useMemo(() => rows.map((row) => row.file.path), [rows]);
  const selection = useEditorTreeSelection(paths);
  const [cutPaths, setCutPaths] = useState<Set<string>>(() => new Set());

  const selectRow = useCallback((path: string, index: number, additive = false, range = false) => {
    const targetPath = paths[index] === path ? path : paths.find((rowPath) => rowPath === path);
    if (!targetPath) return;
    const next = selection.select(targetPath, focusedPath, { additive, range });
    setFocusedPath(next.focusedPath);
  }, [paths, focusedPath, selection.select]);

  return {
    focusedPath,
    setFocusedPath,
    selectedPaths: selection.selectedPaths,
    setSelectedPaths: selection.setSelectedPaths,
    selectionAnchorPath: selection.anchorPath,
    setSelectionAnchorPath: selection.setAnchorPath,
    clearSelection: selection.clear,
    cutPaths,
    setCutPaths,
    selectRow,
  };
}
