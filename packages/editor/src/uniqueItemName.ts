import type { EditorProvider, EditorTreeItem } from "./provider";
import { resolveEditorTreeDirectory } from "./resolveEditorTreePath";

/** Return the first case-insensitively unused sibling name. */
export function nextEditorItemName(existingNames: Iterable<string>, base: string, extension: string): string {
  const names = new Set([...existingNames].map((name) => name.toLowerCase()));
  const first = `${base}${extension}`;
  if (!names.has(first.toLowerCase())) return first;
  let index = 1;
  while (names.has(`${base} ${index}${extension}`.toLowerCase())) index++;
  return `${base} ${index}${extension}`;
}

/** Resolve a provider directory and select a collision-free sibling name. */
export async function nextEditorItemNameInDirectory(
  provider: Pick<EditorProvider, "listChildren">,
  directoryPath: string,
  base: string,
  extension: string,
): Promise<{ parent: EditorTreeItem | null; name: string }> {
  const parent = await resolveEditorTreeDirectory(provider, directoryPath, "Parent folder no longer exists");
  const children = await provider.listChildren(parent?.itemId ?? null);
  return { parent, name: nextEditorItemName(children.map((item) => item.name), base, extension) };
}
