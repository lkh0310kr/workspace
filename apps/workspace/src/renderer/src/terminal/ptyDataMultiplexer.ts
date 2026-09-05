import { reprTerminalBytes, termLog } from "./terminalDebugLog";

type PtyDataHandler = {
  onData: (data: string) => void;
  lastSeq: number;
};

const handlersByTerminalId = new Map<number, PtyDataHandler>();
const pendingByTerminalId = new Map<number, Array<{ seq: number; data: Uint8Array }>>();
let unsubscribe: (() => void) | null = null;

function normalizeTerminalId(id: unknown): number | null {
  const terminalId = typeof id === "number" ? id : Number(id);
  return Number.isFinite(terminalId) ? terminalId : null;
}

function decodePtyPayload(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function deliverToHandler(terminalId: number, seq: number, data: Uint8Array): void {
  const entry = handlersByTerminalId.get(terminalId);
  if (!entry) {
    const pending = pendingByTerminalId.get(terminalId) ?? [];
    pending.push({ seq, data });
    pendingByTerminalId.set(terminalId, pending);
    return;
  }
  if (seq <= entry.lastSeq) {
    return;
  }
  entry.lastSeq = seq;
  const text = decodePtyPayload(data);
  termLog(
    "pty:ipc",
    "onData",
    { bytes: reprTerminalBytes(text), length: text.length, seq },
    terminalId,
  );
  entry.onData(text);
}

function flushPending(terminalId: number): void {
  const pending = pendingByTerminalId.get(terminalId);
  if (!pending?.length) return;
  pendingByTerminalId.delete(terminalId);
  pending.sort((a, b) => a.seq - b.seq);
  for (const chunk of pending) {
    deliverToHandler(terminalId, chunk.seq, chunk.data);
  }
}

function ensureSubscribed(): void {
  if (unsubscribe) {
    return;
  }
  unsubscribe = window.api.pty.onData((id, seq, data) => {
    const terminalId = normalizeTerminalId(id);
    if (terminalId == null) return;
    deliverToHandler(terminalId, seq, data);
  });
}

/** Test-only reset — vitest shares module state across cases. */
export function __resetPtyDataMultiplexerForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  handlersByTerminalId.clear();
  pendingByTerminalId.clear();
}

/** Register the global pty:data listener before any terminal pane mounts. */
export function bootstrapPtyDataMultiplexer(): void {
  ensureSubscribed();
}

export function subscribePtyData(
  terminalId: number,
  onData: (data: string) => void,
  initialLastSeq: number,
): () => void {
  handlersByTerminalId.set(terminalId, { onData, lastSeq: initialLastSeq });
  ensureSubscribed();
  flushPending(terminalId);
  return () => {
    handlersByTerminalId.delete(terminalId);
    pendingByTerminalId.delete(terminalId);
    if (handlersByTerminalId.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}

export function setPtyDataLastSeq(terminalId: number, lastSeq: number): void {
  const entry = handlersByTerminalId.get(terminalId);
  if (entry) {
    entry.lastSeq = lastSeq;
    flushPending(terminalId);
  }
}
