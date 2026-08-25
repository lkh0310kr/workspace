import { reprTerminalBytes, termLog } from "./terminalDebugLog";

type PtyDataHandler = {
  onData: (data: string) => void;
  lastSeq: number;
};

const handlersByTerminalId = new Map<number, PtyDataHandler>();
let unsubscribe: (() => void) | null = null;

function ensureSubscribed(): void {
  if (unsubscribe) {
    return;
  }
  unsubscribe = window.api.pty.onData((id, seq, data) => {
    const entry = handlersByTerminalId.get(id);
    if (!entry || seq <= entry.lastSeq) {
      return;
    }
    entry.lastSeq = seq;
    const text = new TextDecoder().decode(data);
    termLog(
      "pty:ipc",
      "onData",
      { bytes: reprTerminalBytes(text), length: text.length, seq },
      id,
    );
    entry.onData(text);
  });
}

export function subscribePtyData(
  terminalId: number,
  onData: (data: string) => void,
  initialLastSeq: number,
): () => void {
  handlersByTerminalId.set(terminalId, { onData, lastSeq: initialLastSeq });
  ensureSubscribed();
  return () => {
    handlersByTerminalId.delete(terminalId);
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
  }
}
