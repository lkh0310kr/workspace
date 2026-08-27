// Linear snapshot undo/redo — see docs/architecture/08-vector-editor.md's
// "Undo/Redo" section for why this is a plain history array (pointer
// into it) rather than a command/inverse-command system: simplest
// correct approach at this document's size.
//
// A history entry is pushed once per *completed gesture* (drag ends,
// pen path commits, group/ungroup, a style edit settles), not once per
// intermediate frame — otherwise dragging one shape for a second would
// flood the stack with dozens of near-identical entries. Callers own
// that distinction (see VectorEditorContent.tsx's beginHistoryEntry/
// commitHistoryEntry) — this module just manages the stack itself.

import type { VectorDocument } from "./sceneGraph";

export interface VectorHistory {
  past: VectorDocument[];
  future: VectorDocument[];
}

const MAX_HISTORY = 100;

export function emptyHistory(): VectorHistory {
  return { past: [], future: [] };
}

/** Records `before` (the document as it was *before* the just-completed
 * change) onto the undo stack, clearing any redo stack — the standard
 * "a new edit invalidates the old future" rule. No-op if `before` is
 * identical to `after` (nothing actually changed this gesture). */
export function pushHistory(history: VectorHistory, before: VectorDocument, after: VectorDocument): VectorHistory {
  if (before === after) return history;
  const past = [...history.past, before];
  while (past.length > MAX_HISTORY) past.shift();
  return { past, future: [] };
}

export function canUndo(history: VectorHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: VectorHistory): boolean {
  return history.future.length > 0;
}

/** Returns null if there's nothing to undo. `current` is pushed onto the
 * redo stack so a subsequent redo can restore it. */
export function undo(history: VectorHistory, current: VectorDocument): { history: VectorHistory; document: VectorDocument } | null {
  if (history.past.length === 0) return null;
  const previous = history.past[history.past.length - 1];
  const past = history.past.slice(0, -1);
  const future = [current, ...history.future];
  return { history: { past, future }, document: previous };
}

export function redo(history: VectorHistory, current: VectorDocument): { history: VectorHistory; document: VectorDocument } | null {
  if (history.future.length === 0) return null;
  const next = history.future[0];
  const future = history.future.slice(1);
  const past = [...history.past, current];
  return { history: { past, future }, document: next };
}
