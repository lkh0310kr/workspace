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

/** Host-owned persistent key/value store. The shared editor also keeps a bounded in-memory cache. */
export interface EditorViewStateStorage {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

const cache = new Map<string, CachedEditorState>();
const MAX_CACHED_DOCUMENTS = 64;
const STORAGE_PREFIX = "editor:view-state:";
const LEGACY_STORAGE_PREFIX = "workspace:editor-view-state:";
const MAX_PERSISTED_DOCUMENTS = 24;
const MAX_PERSISTED_ENTRY_LENGTH = 40_000;

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(key)}`;
}

function legacyStorageKey(key: string): string {
  return `${LEGACY_STORAGE_PREFIX}${encodeURIComponent(key)}`;
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

function persistState(key: string, state: CachedEditorState, storage?: EditorViewStateStorage): void {
  if (!storage) return;
  try {
    const encoded = JSON.stringify(state);
    const itemKey = storageKey(key);
    if (encoded.length > MAX_PERSISTED_ENTRY_LENGTH) {
      storage.removeItem(itemKey);
      return;
    }
    storage.setItem(itemKey, encoded);
    const persisted: Array<{ key: string; touchedAt: number }> = [];
    for (let index = 0; index < storage.length; index++) {
      const candidateKey = storage.key(index);
      if (!candidateKey?.startsWith(STORAGE_PREFIX) && !candidateKey?.startsWith(LEGACY_STORAGE_PREFIX)) continue;
      const candidate = decodeState(storage.getItem(candidateKey));
      if (candidate) persisted.push({ key: candidateKey, touchedAt: candidate.touchedAt });
    }
    persisted.sort((a, b) => b.touchedAt - a.touchedAt);
    for (const stale of persisted.slice(MAX_PERSISTED_DOCUMENTS)) storage.removeItem(stale.key);
  } catch {
    // Keep the memory cache available when storage is disabled or full.
  }
}

export function readEditorViewState(key: string, storage?: EditorViewStateStorage): CachedEditorState | undefined {
  const state = cache.get(key) ?? (() => {
    try {
      const currentKey = storageKey(key);
      const legacyKey = legacyStorageKey(key);
      const currentValue = storage?.getItem(currentKey) ?? null;
      const restored = decodeState(currentValue ?? storage?.getItem(legacyKey) ?? null);
      if (restored) {
        cache.set(key, restored);
        if (currentValue == null && storage) {
          try {
            storage.setItem(currentKey, JSON.stringify(restored));
            storage.removeItem(legacyKey);
          } catch { /* Keep restored state usable even if legacy-key migration cannot persist. */ }
        }
      }
      return restored;
    } catch {
      return undefined;
    }
  })();
  if (!state) return undefined;
  state.touchedAt = Date.now();
  if (state.persistable !== false) persistState(key, state, storage);
  return state;
}

export function writeEditorViewState(key: string, state: EditorState, scrollTop: number, scrollLeft: number, persist = true, storage?: EditorViewStateStorage): void {
  const cached: CachedEditorState = {
    serialized: state.toJSON({ history: historyField }),
    doc: state.doc.toString(),
    scrollTop,
    scrollLeft,
    touchedAt: Date.now(),
    persistable: persist,
  };
  cache.set(key, cached);
  if (persist) persistState(key, cached, storage);
  while (cache.size > MAX_CACHED_DOCUMENTS) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
    if (!oldest) break;
    cache.delete(oldest[0]);
  }
}

export function moveEditorViewState(fromKey: string, toKey: string, storage?: EditorViewStateStorage): void {
  if (fromKey === toKey) return;
  const state = cache.get(fromKey);
  if (!state) return;
  cache.delete(fromKey);
  state.touchedAt = Date.now();
  cache.set(toKey, state);
  try {
    storage?.removeItem(storageKey(fromKey));
    storage?.removeItem(legacyStorageKey(fromKey));
  } catch { /* ignore unavailable storage */ }
  if (state.persistable !== false) persistState(toKey, state, storage);
}

/** Drop provider-unsaved in-memory content after the user confirms discarding a document. */
export function discardEditorViewState(key: string): void {
  cache.delete(key);
  // The view's unmount cleanup runs in the same React commit and may write one final dirty snapshot.
  setTimeout(() => cache.delete(key), 0);
}

