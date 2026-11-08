import type { EditorState } from "@codemirror/state";
import { historyField } from "@codemirror/commands";

export interface CachedEditorState {
  serialized: unknown;
  doc: string;
  scrollTop: number;
  scrollLeft: number;
  touchedAt: number;
}

const cache = new Map<string, CachedEditorState>();
const MAX_CACHED_DOCUMENTS = 64;

export function readEditorViewState(key: string): CachedEditorState | undefined {
  const state = cache.get(key);
  if (!state) return undefined;
  state.touchedAt = Date.now();
  return state;
}

export function writeEditorViewState(key: string, state: EditorState, scrollTop: number, scrollLeft: number): void {
  cache.set(key, {
    serialized: state.toJSON({ history: historyField }),
    doc: state.doc.toString(),
    scrollTop,
    scrollLeft,
    touchedAt: Date.now(),
  });
  while (cache.size > MAX_CACHED_DOCUMENTS) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
    if (!oldest) break;
    cache.delete(oldest[0]);
  }
}

export function moveEditorViewState(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const state = cache.get(fromKey);
  if (!state) return;
  cache.delete(fromKey);
  state.touchedAt = Date.now();
  cache.set(toKey, state);
}

