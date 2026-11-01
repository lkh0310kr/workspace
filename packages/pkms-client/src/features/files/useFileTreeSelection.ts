import { useCallback, useState } from "react";
import type { TreeRow } from "../../domain/types";

export function useFileTreeSelection(rows: TreeRow[]) {
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null);
  const [cutPaths, setCutPaths] = useState<Set<string>>(() => new Set());

  const selectRow = useCallback((path: string, index: number, additive = false, range = false) => {
    setFocusedPath(path);
    if (range) {
      const anchor = rows.findIndex((row) => row.file.path === (selectionAnchorPath ?? path));
      const from = anchor < 0 ? index : anchor;
      const paths = rows.slice(Math.min(from, index), Math.max(from, index) + 1).map((row) => row.file.path);
      setSelectedPaths((current) => new Set([...(additive ? current : []), ...paths]));
      if (!selectionAnchorPath) setSelectionAnchorPath(path);
    } else if (additive) {
      setSelectedPaths((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setSelectionAnchorPath(path);
    } else {
      setSelectedPaths(new Set([path]));
      setSelectionAnchorPath(path);
    }
  }, [rows, selectionAnchorPath]);

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
