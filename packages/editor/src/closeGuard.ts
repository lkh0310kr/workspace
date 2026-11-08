/** Ask before discarding provider edits that are not yet durably saved. */
export function confirmEditorDocumentClose(unsaved: boolean, label = "This document"): boolean {
  if (!unsaved) return true;
  return window.confirm(`${label} has unsaved changes. Close it anyway?`);
}
