import type { EditorItemRef } from "./provider";

/** Stable document identity shared by editor caches and host-owned tabs. */
export function editorDocumentKey(ref: EditorItemRef): string {
  return `${ref.providerId}:${ref.itemId}`;
}
