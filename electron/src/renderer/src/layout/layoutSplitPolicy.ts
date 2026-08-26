/** Order of flexlayout mutations when splitting a tab into a new pane. */
export type SplitPaneMutationStrategy =
  | "add-then-delete"
  | "add-then-update"
  | "delete-then-add"
  | "update-then-add";

/**
 * Same-pane splits must add the new tabset before mutating/deleting the
 * source tab node so flexlayout still has a valid anchor tabset.
 */
export function resolveSplitPaneMutationStrategy(
  samePane: boolean,
  emptySource: boolean,
): SplitPaneMutationStrategy {
  if (samePane) return emptySource ? "add-then-delete" : "add-then-update";
  return emptySource ? "delete-then-add" : "update-then-add";
}
