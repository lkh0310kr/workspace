import type * as Y from "yjs";

export function applyTextDiff(text: Y.Text, previous: string, next: string): void {
  if (previous === next) return;
  let prefix = 0;
  const maxPrefix = Math.min(previous.length, next.length);
  while (prefix < maxPrefix && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix &&
    previous.charCodeAt(previous.length - suffix - 1) === next.charCodeAt(next.length - suffix - 1)) suffix++;
  const removed = previous.length - prefix - suffix;
  const inserted = next.slice(prefix, next.length - suffix);
  text.doc!.transact(() => {
    if (removed) text.delete(prefix, removed);
    if (inserted) text.insert(prefix, inserted);
  }, "local-editor");
}
