import { reprTerminalBytes, termLog } from "./terminalDebugLog";

type PtyDataHandler = {
  onData: (data: string) => void;
  lastSeq: number;
};

const handlersByTerminalId = new Map<number, PtyDataHandler>();
const pendingByTerminalId = new Map<number, Array<{ seq: number; data: string }>>();
const decoderByTerminalId = new Map<number, TextDecoder>();
const seenSeqByTerminalId = new Map<number, number>();
let unsubscribe: (() => void) | null = null;

function normalizeTerminalId(id: unknown): number | null {
  const terminalId = typeof id === "number" ? id : Number(id);
  return Number.isFinite(terminalId) ? terminalId : null;
}

function deliverTextToHandler(terminalId: number, seq: number, text: string): void {
  const entry = handlersByTerminalId.get(terminalId);
  if (!entry) {
    if (text.length === 0) return;
    const pending = pendingByTerminalId.get(terminalId) ?? [];
    pending.push({ seq, data: text });
    pendingByTerminalId.set(terminalId, pending);
    return;
  }
  if (seq <= entry.lastSeq) {
    return;
  }
  entry.lastSeq = seq;
  if (text.length === 0) return;
  termLog(
    "pty:ipc",
    "onData",
    { bytes: reprTerminalBytes(text), length: text.length, seq },
    terminalId,
  );
  entry.onData(text);
}

function deliverToHandler(terminalId: number, seq: number, data: Uint8Array): void {
  // PTY events are arbitrary byte chunks; a UTF-8 character can span events.
  // Keep one decoder per terminal so split Hangul/emoji are preserved across
  // both live writes and pane detach/reattach cycles.
  const seenSeq = seenSeqByTerminalId.get(terminalId) ?? -1;
  if (seq <= seenSeq) return;
  seenSeqByTerminalId.set(terminalId, seq);

  let decoder = decoderByTerminalId.get(terminalId);
  if (!decoder) {
    decoder = new TextDecoder("utf-8");
    decoderByTerminalId.set(terminalId, decoder);
  }
  const text = decoder.decode(data, { stream: true });
  deliverTextToHandler(terminalId, seq, text);
}

function flushPending(terminalId: number): void {
  const pending = pendingByTerminalId.get(terminalId);
  if (!pending?.length) return;
  pendingByTerminalId.delete(terminalId);
  pending.sort((a, b) => a.seq - b.seq);
  for (const chunk of pending) {
    deliverTextToHandler(terminalId, chunk.seq, chunk.data);
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
  decoderByTerminalId.clear();
  seenSeqByTerminalId.clear();
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
  seenSeqByTerminalId.set(
    terminalId,
    Math.max(seenSeqByTerminalId.get(terminalId) ?? -1, initialLastSeq),
  );
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
