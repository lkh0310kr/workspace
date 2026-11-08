import type { EditorItemKind } from "./provider";

export interface EditorTreeNavigationRow {
  path: string;
  kind: EditorItemKind;
  depth: number;
}

export type EditorTreeArrowAction =
  | { type: "focus"; path: string; index: number }
  | { type: "expand" | "collapse"; path: string };

export type EditorTreeKeyboardAction =
  | { type: "navigate"; action: EditorTreeArrowAction }
  | { type: "delete" | "rename" | "activate" };

/** Map common tree keyboard input to a semantic action; hosts execute product operations. */
export function resolveEditorTreeKeyboardAction(
  key: string,
  rows: readonly EditorTreeNavigationRow[],
  focusedPath: string | null,
  expandedPaths: ReadonlySet<string>,
): EditorTreeKeyboardAction | null {
  if (key.startsWith("Arrow")) {
    const action = resolveEditorTreeArrowKey(rows, focusedPath, expandedPaths, key);
    return action ? { type: "navigate", action } : null;
  }
  if (key === "Delete" || key === "Backspace") return { type: "delete" };
  if (key === "F2") return { type: "rename" };
  if (key === "Enter") return { type: "activate" };
  return null;
}

/** Shared arrow-key navigation for loaded tree rows. */
export function resolveEditorTreeArrowKey(
  rows: readonly EditorTreeNavigationRow[],
  focusedPath: string | null,
  expandedPaths: ReadonlySet<string>,
  key: string,
): EditorTreeArrowAction | null {
  if (!rows.length) return null;
  const index = rows.findIndex((row) => row.path === focusedPath);
  const row = rows[index];
  if (key === "ArrowDown" || key === "ArrowUp") {
    const next = index < 0
      ? (key === "ArrowDown" ? 0 : rows.length - 1)
      : Math.max(0, Math.min(rows.length - 1, index + (key === "ArrowDown" ? 1 : -1)));
    return { type: "focus", path: rows[next].path, index: next };
  }
  if (!row) return null;
  if (key === "ArrowRight" && row.kind === "directory") {
    if (!expandedPaths.has(row.path)) return { type: "expand", path: row.path };
    const firstChild = rows[index + 1];
    if (firstChild && firstChild.depth > row.depth) return { type: "focus", path: firstChild.path, index: index + 1 };
  }
  if (key === "ArrowLeft") {
    if (row.kind === "directory" && expandedPaths.has(row.path)) return { type: "collapse", path: row.path };
    const separator = row.path.lastIndexOf("/");
    const parentPath = separator < 0 ? "" : row.path.slice(0, separator);
    const parentIndex = rows.findIndex((candidate) => candidate.path === parentPath);
    if (parentIndex >= 0) return { type: "focus", path: parentPath, index: parentIndex };
  }
  return null;
}
