import { EDITOR_TREE_ROW_HEIGHT, projectEditorTreeRows } from './treeModel'

/** Projects visible rows for the Editor tree viewport. */
export function projectVisibleEditorTreeRows<T>(
  flatList: T[],
  scrollTop: number,
  viewportHeight: number
) {
  return projectEditorTreeRows(flatList, scrollTop, viewportHeight, EDITOR_TREE_ROW_HEIGHT)
}
