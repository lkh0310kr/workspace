import type { FileRecord, TreeRow } from "./types";

export function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

export function entryName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function mergeFileRecords(current: FileRecord[], incoming: FileRecord[]): FileRecord[] {
  const byPath = new Map(current.map((file) => [file.path, file]));
  for (const file of incoming) byPath.set(file.path, file);
  return [...byPath.values()];
}

export function treeSelectionRoots(files: FileRecord[], selectedPaths: Set<string>): FileRecord[] {
  const folders = new Set(files.filter((file) => file.kind === "folder" && selectedPaths.has(file.path)).map((file) => file.path));
  return files.filter((file) => {
    if (!selectedPaths.has(file.path)) return false;
    let parent = parentPath(file.path);
    while (parent) {
      if (folders.has(parent)) return false;
      parent = parentPath(parent);
    }
    return true;
  });
}

export function parseTreeDragPaths(data: string): string[] {
  try {
    const paths: unknown = JSON.parse(data);
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : [];
  } catch {
    return [];
  }
}

export function flattenTree(files: FileRecord[], expanded: Set<string>): TreeRow[] {
  const children = new Map<string, FileRecord[]>();
  for (const file of files) {
    const parent = parentPath(file.path);
    const siblings = children.get(parent) ?? [];
    siblings.push(file);
    children.set(parent, siblings);
  }
  const rows: TreeRow[] = [];
  const visit = (parent: string, depth: number) => {
    const siblings = children.get(parent) ?? [];
    siblings.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || entryName(a.path).localeCompare(entryName(b.path), undefined, { sensitivity: "base" }));
    for (const file of siblings) {
      rows.push({ file, depth });
      if (file.kind === "folder" && expanded.has(file.path)) visit(file.path, depth + 1);
    }
  };
  visit("", 0);
  return rows;
}
