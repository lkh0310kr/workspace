export interface EditorTreeSelectionState {
  focusedPath: string | null;
  anchorPath: string | null;
  selectedPaths: ReadonlySet<string>;
}

export interface EditorTreeSelectionModifiers {
  additive?: boolean;
  range?: boolean;
}

/** Apply the shared single, additive, and range-selection rules to visible tree paths. */
export function resolveEditorTreeSelection(
  visiblePaths: readonly string[],
  current: EditorTreeSelectionState,
  path: string,
  modifiers: EditorTreeSelectionModifiers = {},
): EditorTreeSelectionState {
  const index = visiblePaths.indexOf(path);
  if (index < 0) return current;

  if (modifiers.range) {
    const anchorPath = current.anchorPath ?? current.focusedPath ?? path;
    const anchorIndex = visiblePaths.indexOf(anchorPath);
    const from = anchorIndex < 0 ? index : anchorIndex;
    const range = visiblePaths.slice(Math.min(from, index), Math.max(from, index) + 1);
    return {
      focusedPath: path,
      anchorPath,
      selectedPaths: new Set([...(modifiers.additive ? current.selectedPaths : []), ...range]),
    };
  }

  if (modifiers.additive) {
    const selectedPaths = new Set(current.selectedPaths);
    if (selectedPaths.has(path)) selectedPaths.delete(path);
    else selectedPaths.add(path);
    return { focusedPath: path, anchorPath: path, selectedPaths };
  }

  return { focusedPath: path, anchorPath: path, selectedPaths: new Set([path]) };
}
