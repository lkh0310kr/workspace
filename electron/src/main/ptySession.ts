import { Pty } from "./pty";
import { appendTerminalLog, reprTerminalBytesMain } from "./terminalDebugLog";

const REPLAY_MAX_CHARS = 5000 * 120;

export interface PtyConnectResult {
  id: number;
  snapshot: string;
  snapshotCols: number;
  snapshotRows: number;
  lastSeq: number;
  isReattach: boolean;
}

export class PtyReplayBuffer {
  private chunks: string[] = [];
  private totalChars = 0;
  private seq = 0;

  appendUtf8(data: Buffer): number {
    const str = data.toString("utf8");
    if (str.length === 0) return this.seq;
    this.seq++;
    this.chunks.push(str);
    this.totalChars += str.length;
    while (this.totalChars > REPLAY_MAX_CHARS && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.totalChars -= removed.length;
    }
    return this.seq;
  }

  snapshot(): { replay: string; lastSeq: number } {
    return { replay: this.chunks.join(""), lastSeq: this.seq };
  }
}

export class PtySession {
  readonly id: number;
  private pty: Pty;
  private cols: number;
  private rows: number;
  private replay = new PtyReplayBuffer();
  private attachedWebContentsId: number | null = null;
  private wasEverAttached = false;
  private onDataListener: ((id: number, seq: number, data: Buffer) => void) | null = null;

  constructor(id: number, pty: Pty, cols: number, rows: number) {
    this.id = id;
    this.pty = pty;
    this.cols = cols;
    this.rows = rows;
    pty.onData((data) => {
      const seq = this.replay.appendUtf8(data);
      appendTerminalLog({
        sessionId: "terminal",
        timestamp: Date.now(),
        location: "main:pty:read",
        message: "from-shell",
        terminalId: this.id,
        data: { bytes: reprTerminalBytesMain(data), length: data.length, seq },
      });
      if (this.attachedWebContentsId != null) {
        this.onDataListener?.(this.id, seq, data);
      }
    });
  }

  setOnData(listener: (id: number, seq: number, data: Buffer) => void): void {
    this.onDataListener = listener;
  }

  connect(webContentsId: number): PtyConnectResult {
    this.attachedWebContentsId = webContentsId;
    const isReattach = this.wasEverAttached;
    this.wasEverAttached = true;
    const { replay, lastSeq } = this.replay.snapshot();
    return {
      id: this.id,
      snapshot: replay,
      snapshotCols: this.cols,
      snapshotRows: this.rows,
      lastSeq,
      isReattach,
    };
  }

  disconnect(webContentsId: number): void {
    if (this.attachedWebContentsId === webContentsId) {
      this.attachedWebContentsId = null;
    }
  }

  isAttached(): boolean {
    return this.attachedWebContentsId != null;
  }

  write(data: Buffer): void {
    appendTerminalLog({
      sessionId: "terminal",
      timestamp: Date.now(),
      location: "main:pty:write",
      message: "to-shell",
      terminalId: this.id,
      data: { bytes: reprTerminalBytesMain(data), length: data.length },
    });
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.pty.resize(cols, rows);
  }

  dispose(): void {
    this.attachedWebContentsId = null;
    this.pty.dispose();
  }

  getCols(): number {
    return this.cols;
  }

  getRows(): number {
    return this.rows;
  }
}
