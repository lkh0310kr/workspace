import { useCallback, useState } from "react";
import { resolveEditorTreeSelection } from "@workspace/editor";
import type { TreeRow } from "../../domain/types";

export function useFileTreeSelection(rows: TreeRow[]) {
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null);
  const [cutPaths, setCutPaths] = useState<Set<string>>(() => new Set());

  const selectRow = useCallback((path: string, index: number, additive = false, range = false) => {
    const targetPath = rows[index]?.file.path === path ? path : rows.find((row) => row.file.path === path)?.file.path;
    if (!targetPath) return;
    const next = resolveEditorTreeSelection(
      rows.map((row) => row.file.path),
      { focusedPath, anchorPath: selectionAnchorPath, selectedPaths },
      targetPath,
      { additive, range },
    );
    setFocusedPath(next.focusedPath);
    setSelectionAnchorPath(next.anchorPath);
    setSelectedPaths(new Set(next.selectedPaths));
  }, [rows, focusedPath, selectionAnchorPath, selectedPaths]);

  return {
    focusedPath,
    setFocusedPath,
    selectedPaths,
    setSelectedPaths,
    selectionAnchorPath,
    setSelectionAnchorPath,
    cutPaths,
    setCutPaths,
    selectRow,
  };
}
