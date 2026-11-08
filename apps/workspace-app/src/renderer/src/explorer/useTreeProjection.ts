import { EDITOR_TREE_ROW_HEIGHT, projectEditorTreeRows } from "@workspace/editor";

export const TREE_ROW_HEIGHT = EDITOR_TREE_ROW_HEIGHT;

/** Compatibility entry point for existing Explorer callers and tests. */
export function projectVisibleRows<T>(flatList: T[], scrollTop: number, viewportHeight: number) {
  return projectEditorTreeRows(flatList, scrollTop, viewportHeight, TREE_ROW_HEIGHT);
}
