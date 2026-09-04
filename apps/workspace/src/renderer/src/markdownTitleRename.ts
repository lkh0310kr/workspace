// Pure helpers for EditorContent.tsx's Obsidian-style click-to-rename title.
// Kept separate (and separately tested) from the component so the
// validation/path-building logic doesn't need a mounted CodeMirror view to
// exercise — mirrors layoutSalvage.ts/layoutExport.ts's own pure-module
// pattern rather than burying this in the component.

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** ".markdown" if the path ends in it (case-insensitive), else the ".md"
 * default — TreeView.tsx's classifyFile() already treats both as markdown
 * kind, so a title rename must preserve whichever one the file already has. */
export function markdownExtensionOf(path: string): ".md" | ".markdown" {
  return /\.markdown$/i.test(path) ? ".markdown" : ".md";
}

export function markdownTitleFor(filePath: string | null): string {
  if (!filePath) return "Untitled";
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.(md|markdown)$/i, "");
}

export type TitleValidationError = "empty" | "invalid-chars";

/** Trims and validates raw title input; returns the trimmed title or an
 * error code — doesn't touch the filesystem (no conflict check here, that
 * needs an async listDir call the caller owns). */
export function validateTitleInput(raw: string): { title: string } | { error: TitleValidationError } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "empty" };
  if (trimmed.includes("/") || trimmed.includes("\\")) return { error: "invalid-chars" };
  return { title: trimmed };
}

/** Where a rename to `newTitle` would land: same directory, same extension
 * the file already has (or the default .md when there's no current path —
 * the untitled/Save-As case). */
export function buildRenamedPath(currentPath: string | null, newTitle: string): string {
  const dir = currentPath ? dirOf(currentPath) : "";
  const ext = currentPath ? markdownExtensionOf(currentPath) : ".md";
  return joinPath(dir, `${newTitle}${ext}`);
}
