export interface EditorTreeBranchEntry {
  path: string;
  name: string;
  directory: boolean;
}

export interface EditorVisibleTreeRow<T extends EditorTreeBranchEntry> {
  item: T;
  depth: number;
}

/** Flatten loaded branches with the shared Workspace tree ordering. */
export function flattenEditorTree<T extends EditorTreeBranchEntry>(
  branches: ReadonlyMap<string, readonly T[]>,
  expanded: ReadonlySet<string>,
  root = "",
): EditorVisibleTreeRow<T>[] {
  const rows: EditorVisibleTreeRow<T>[] = [];
  const visit = (parent: string, depth: number, ancestors: ReadonlySet<string>) => {
    const children = [...(branches.get(parent) ?? [])].sort((a, b) =>
      Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    for (const item of children) {
      rows.push({ item, depth });
      if (item.directory && expanded.has(item.path) && !ancestors.has(item.path)) {
        visit(item.path, depth + 1, new Set(ancestors).add(item.path));
      }
    }
  };
  visit(root, 0, new Set());
  return rows;
}
