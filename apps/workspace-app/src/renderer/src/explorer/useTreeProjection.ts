import { projectEditorTreeRows } from "@workspace/editor";

export const TREE_ROW_HEIGHT = 24;

/** Compatibility entry point for existing Explorer callers and tests. */
export function projectVisibleRows<T>(flatList: T[], scrollTop: number, viewportHeight: number) {
  return projectEditorTreeRows(flatList, scrollTop, viewportHeight, TREE_ROW_HEIGHT);
}
