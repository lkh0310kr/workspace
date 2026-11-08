import type { EditorState } from "@codemirror/state";
import { historyField } from "@codemirror/commands";

export interface CachedEditorState {
  serialized: unknown;
  doc: string;
  scrollTop: number;
  scrollLeft: number;
  touchedAt: number;
  /** False when this cache snapshot includes provider-unsaved edits. */
  persistable?: boolean;
}

const cache = new Map<string, CachedEditorState>();
const MAX_CACHED_DOCUMENTS = 64;
const STORAGE_PREFIX = "workspace:editor-view-state:";
const MAX_PERSISTED_DOCUMENTS = 24;
const MAX_PERSISTED_ENTRY_LENGTH = 40_000;

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(key)}`;
}

function decodeState(value: string | null): CachedEditorState | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return undefined;
    const state = parsed as Partial<CachedEditorState>;
    if (typeof state.doc !== "string" || typeof state.scrollTop !== "number" || typeof state.scrollLeft !== "number") return undefined;
    if (typeof state.touchedAt !== "number" || state.serialized == null) return undefined;
    return state as CachedEditorState;
  } catch {
    return undefined;
  }
}

function persistState(key: string, state: CachedEditorState): void {
  try {
    const encoded = JSON.stringify(state);
    const itemKey = storageKey(key);
    if (encoded.length > MAX_PERSISTED_ENTRY_LENGTH) {
      localStorage.removeItem(itemKey);
      return;
    }
    localStorage.setItem(itemKey, encoded);
    const persisted: Array<{ key: string; touchedAt: number }> = [];
    for (let index = 0; index < localStorage.length; index++) {
      const candidateKey = localStorage.key(index);
      if (!candidateKey?.startsWith(STORAGE_PREFIX)) continue;
      const candidate = decodeState(localStorage.getItem(candidateKey));
      if (candidate) persisted.push({ key: candidateKey, touchedAt: candidate.touchedAt });
    }
    persisted.sort((a, b) => b.touchedAt - a.touchedAt);
    for (const stale of persisted.slice(MAX_PERSISTED_DOCUMENTS)) localStorage.removeItem(stale.key);
  } catch {
    // Keep the memory cache available when storage is disabled or full.
  }
}

export function readEditorViewState(key: string): CachedEditorState | undefined {
  const state = cache.get(key) ?? (() => {
    try {
      const restored = decodeState(localStorage.getItem(storageKey(key)));
      if (restored) cache.set(key, restored);
      return restored;
    } catch {
      return undefined;
    }
  })();
  if (!state) return undefined;
  state.touchedAt = Date.now();
  if (state.persistable !== false) persistState(key, state);
  return state;
}

export function writeEditorViewState(key: string, state: EditorState, scrollTop: number, scrollLeft: number, persist = true): void {
  const cached: CachedEditorState = {
    serialized: state.toJSON({ history: historyField }),
    doc: state.doc.toString(),
    scrollTop,
    scrollLeft,
    touchedAt: Date.now(),
    persistable: persist,
  };
  cache.set(key, cached);
  if (persist) persistState(key, cached);
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
  try { localStorage.removeItem(storageKey(fromKey)); } catch { /* ignore unavailable storage */ }
  if (state.persistable !== false) persistState(toKey, state);
}

