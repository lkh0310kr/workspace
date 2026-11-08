import { EditorProviderError, type EditorProvider, type EditorTreeItem } from "./provider";
import { resolveEditorTreeDirectory, resolveEditorTreePath } from "./resolveEditorTreePath";

// Shared Markdown title path helpers used by editor hosts.
function toEditorRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function directoryOf(path: string): string {
  const normalized = toEditorRelativePath(path);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

/** Preserve the Markdown extension already used by this document. */
export function markdownExtensionOf(path: string): ".md" | ".markdown" {
  return /\.markdown$/i.test(toEditorRelativePath(path)) ? ".markdown" : ".md";
}

export function markdownTitleFor(filePath: string | null): string {
  if (!filePath) return "Untitled";
  const base = toEditorRelativePath(filePath).split("/").pop() ?? filePath;
  return base.replace(/\.(md|markdown)$/i, "");
}

export type TitleValidationError = "empty" | "invalid-chars";

/** Trim title input and reject path separators before a host checks collisions. */
export function validateTitleInput(raw: string): { title: string } | { error: TitleValidationError } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "empty" };
  if (trimmed.includes("/") || trimmed.includes("\\")) return { error: "invalid-chars" };
  return { title: trimmed };
}

/** Build a sibling path while preserving its existing Markdown extension. */
export function buildRenamedPath(currentPath: string | null, newTitle: string): string {
  const directory = currentPath ? directoryOf(currentPath) : "";
  const extension = currentPath ? markdownExtensionOf(currentPath) : ".md";
  return joinPath(directory, `${newTitle}${extension}`);
}
export interface MarkdownTitleRenameTarget {
  title: string;
  path: string;
  name: string;
  currentItem: EditorTreeItem | null;
}

/** Resolve a Markdown title rename through the provider and reject sibling collisions. */
export async function resolveMarkdownTitleRenameTarget(
  provider: EditorProvider,
  currentPath: string | null,
  title: string,
  currentItem?: EditorTreeItem,
): Promise<MarkdownTitleRenameTarget> {
  const path = buildRenamedPath(currentPath, title);
  const name = path.split("/").at(-1) ?? path;
  const directory = directoryOf(path);
  const parent = await resolveEditorTreeDirectory(provider, directory, "The destination folder no longer exists.");
  const source = currentPath
    ? currentItem ?? await resolveEditorTreePath(provider, currentPath)
    : null;
  if (currentPath && !source) throw new EditorProviderError("notFound", "File no longer exists");
  if (currentPath && !provider.rename) throw new EditorProviderError("unsupported", "Renaming is not supported by this provider");

  const siblings = await provider.listChildren(parent?.itemId ?? null);
  const collision = siblings.some((item) =>
    item.name.toLowerCase() === name.toLowerCase() && item.itemId !== source?.itemId,
  );
  if (collision) throw new Error(`"${title}" already exists.`);
  return { title, path, name, currentItem: source };
}
