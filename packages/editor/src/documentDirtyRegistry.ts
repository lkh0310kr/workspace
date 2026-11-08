import { discardEditorViewState } from "./viewStateCache";

interface DirtyDocument {
  label: string;
  path?: string;
  viewStateKey?: string;
}

const dirtyDocuments = new Map<string, DirtyDocument>();
export type EditorConfirm = (message: string) => boolean;

/** Register editor dirty state for shell level close actions. */
export function setEditorDocumentDirty(id: string, dirty: boolean, label = "This document", path?: string, viewStateKey?: string): void {
  if (dirty) dirtyDocuments.set(id, { label, path, viewStateKey });
  else dirtyDocuments.delete(id);
}

/** Clear unsaved CodeMirror snapshots after a confirmed tab close. */
export function discardEditorDocumentViewState(id: string): void {
  const viewStateKey = dirtyDocuments.get(id)?.viewStateKey;
  if (viewStateKey) discardEditorViewState(viewStateKey);
}

export function confirmEditorDocumentCloseById(id: string, confirm: EditorConfirm): boolean {
  const document = dirtyDocuments.get(id);
  return !document || confirmEditorDocumentClose(true, document.label, confirm);
}

export function confirmDirtyEditorDocumentsInPaths(paths: readonly string[], confirm: EditorConfirm): boolean {
  const affected = [...dirtyDocuments.values()].filter((document) => {
    const documentPath = document.path;
    return documentPath !== undefined && paths.some((path) => documentPath === path || documentPath.startsWith(`${path}/`));
  });
  if (affected.length === 0) return true;
  const labels = [...new Set(affected.map((document) => document.label))];
  return confirm(`The following open documents have unsaved changes and will be closed:\n\n${labels.join("\n")}\n\nContinue?`);
}

/** Ask before discarding provider edits that are not yet durably saved. */
export function confirmEditorDocumentClose(unsaved: boolean, label: string, confirm: EditorConfirm): boolean {
  if (!unsaved) return true;
  return confirm(`${label} has unsaved changes. Close it anyway?`);
}

export function clearEditorDocumentDirty(id: string): void {
  dirtyDocuments.delete(id);
}
