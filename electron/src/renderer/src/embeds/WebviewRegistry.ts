/** Max concurrent Chromium guest processes for browser pane tabs. */
export const WEBVIEW_LRU_CAPACITY = 4;

export function webviewSessionKey(workspaceTabId: number, paneTabItemId: string): string {
  return `${workspaceTabId}:${paneTabItemId}`;
}

export type WebviewSlotRelease = () => void;

type Slot = {
  key: string;
  lastAccess: number;
  onEvict: () => void;
  /** Active pane chip — evict inactive chips before these. */
  pinned: boolean;
};

const slots = new Map<string, Slot>();
let accessSeq = 0;

function touchSlot(key: string): void {
  const slot = slots.get(key);
  if (slot) slot.lastAccess = ++accessSeq;
}

function findEvictionCandidate(exceptKey: string): string | null {
  let unpinned: { key: string; lastAccess: number } | null = null;
  let any: { key: string; lastAccess: number } | null = null;
  for (const [key, slot] of slots) {
    if (key === exceptKey) continue;
    if (!any || slot.lastAccess < any.lastAccess) {
      any = { key, lastAccess: slot.lastAccess };
    }
    if (!slot.pinned && (!unpinned || slot.lastAccess < unpinned.lastAccess)) {
      unpinned = { key, lastAccess: slot.lastAccess };
    }
  }
  return unpinned?.key ?? any?.key ?? null;
}

function evictKey(key: string): void {
  const slot = slots.get(key);
  if (!slot) return;
  slots.delete(key);
  slot.onEvict();
}

/**
 * Reserve a live webview slot. Evicts LRU peer when at capacity.
 * Session state (URL, zoom) stays in layout JSON — guest is recreated on acquire.
 */
export function requestWebviewSlot(
  key: string,
  onEvict: () => void,
  options?: { pinned?: boolean },
): WebviewSlotRelease {
  const pinned = options?.pinned ?? false;
  const existing = slots.get(key);
  if (existing) {
    existing.onEvict = onEvict;
    existing.pinned = pinned;
    touchSlot(key);
    return () => releaseWebviewSlot(key);
  }

  while (slots.size >= WEBVIEW_LRU_CAPACITY) {
    const victim = findEvictionCandidate(key);
    if (!victim) break;
    evictKey(victim);
  }

  slots.set(key, { key, lastAccess: ++accessSeq, onEvict, pinned });
  return () => releaseWebviewSlot(key);
}

export function setWebviewSlotPinned(key: string, pinned: boolean): void {
  const slot = slots.get(key);
  if (slot) slot.pinned = pinned;
}

export function releaseWebviewSlot(key: string): void {
  slots.delete(key);
}

export function touchWebviewSlot(key: string): void {
  touchSlot(key);
}

export function getWebviewSlotCount(): number {
  return slots.size;
}

/** Test-only reset. */
export function clearWebviewSlotsForTests(): void {
  for (const key of [...slots.keys()]) {
    evictKey(key);
  }
  accessSeq = 0;
}
