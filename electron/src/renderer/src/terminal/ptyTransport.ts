import { createPtyInputWriteQueue } from "./ptyInputWriteQueue";
import { subscribePtyData } from "./ptyDataMultiplexer";
import { reprTerminalBytes, termLog } from "./terminalDebugLog";

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
  let dataUnlisten: (() => void) | null = null;

  const inputQueue = createPtyInputWriteQueue({
    isWritable: () => connected && !destroyed,
    write: (_id, data) => {
      const bytes = new TextEncoder().encode(data);
      termLog(
        "pty:write",
        "ipc-send",
        { bytes: reprTerminalBytes(data), length: data.length, connected },
        terminalId,
      );
      window.api.pty.write(terminalId, bytes);
    },
  });

  return {
    async connect(callbacks) {
      if (destroyed) throw new Error("transport destroyed");
      const result = await window.api.pty.connect(terminalId);
      connected = true;
      termLog("pty:connect", "connected", { lastSeq: result.lastSeq }, terminalId);

      dataUnlisten?.();
      dataUnlisten = subscribePtyData(terminalId, callbacks.onData, result.lastSeq);

      return result;
    },

    disconnect() {
      if (!connected) return;
      connected = false;
      termLog("pty:connect", "disconnected", {}, terminalId);
      dataUnlisten?.();
      dataUnlisten = null;
      window.api.pty.disconnect(terminalId);
      inputQueue.clear();
    },

    write(data: string) {
      termLog(
        "pty:transport",
        "enqueue",
        { bytes: reprTerminalBytes(data), length: data.length, connected },
        terminalId,
      );
      inputQueue.enqueue(String(terminalId), data);
    },
  };
}
