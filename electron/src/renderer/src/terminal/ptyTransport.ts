import { createPtyInputWriteQueue } from "./ptyInputWriteQueue";

export interface PtyConnectResult {
  id: number;
  snapshot: string;
  snapshotCols: number;
  snapshotRows: number;
  lastSeq: number;
  isReattach: boolean;
}

type DataHandler = (data: string) => void;

export interface PtyTransport {
  connect(callbacks: {
    onData: DataHandler;
    onWriteUnavailable?: () => void;
  }): Promise<PtyConnectResult>;
  disconnect(): void;
  write(data: string): void;
}

export function createElectronPtyTransport(terminalId: number): PtyTransport {
  let connected = false;
  let destroyed = false;
  let lastSeq = 0;
  let dataUnlisten: (() => void) | null = null;

  const inputQueue = createPtyInputWriteQueue({
    isWritable: () => connected && !destroyed,
    write: (_id, data) => {
      const bytes = new TextEncoder().encode(data);
      window.api.pty.write(terminalId, bytes);
    },
  });

  return {
    async connect(callbacks) {
      if (destroyed) throw new Error("transport destroyed");
      const result = await window.api.pty.connect(terminalId);
      connected = true;
      lastSeq = result.lastSeq;

      dataUnlisten?.();
      dataUnlisten = window.api.pty.onData((id, seq, data) => {
        if (id !== terminalId) return;
        if (seq <= lastSeq) return;
        lastSeq = seq;
        callbacks.onData(new TextDecoder().decode(data));
      });

      return result;
    },

    disconnect() {
      if (!connected) return;
      connected = false;
      dataUnlisten?.();
      dataUnlisten = null;
      window.api.pty.disconnect(terminalId);
      inputQueue.clear();
    },

    write(data: string) {
      inputQueue.enqueue(String(terminalId), data);
    },
  };
}
