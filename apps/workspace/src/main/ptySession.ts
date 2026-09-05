import type { WebContents } from "electron";
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
  private attachedWebContents: WebContents | null = null;
  private wasEverAttached = false;

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
      this.pushLiveOutput(seq, data);
    });
  }

  private pushLiveOutput(seq: number, data: Buffer): void {
    const webContents = this.attachedWebContents;
    if (!webContents || webContents.isDestroyed()) return;
    try {
      webContents.send("pty:data", {
        id: this.id,
        seq,
        data: Uint8Array.from(data),
      });
      appendTerminalLog({
        sessionId: "terminal",
        timestamp: Date.now(),
        location: "main:pty:send",
        message: "to-renderer",
        terminalId: this.id,
        data: { bytes: reprTerminalBytesMain(data), length: data.length, seq },
      });
    } catch (err) {
      console.error(`[pty] pty:data send failed for terminal ${this.id}:`, err);
    }
  }

  connect(webContents: WebContents): PtyConnectResult {
    this.attachedWebContents = webContents;
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

  disconnect(webContents: WebContents): void {
    if (this.attachedWebContents === webContents) {
      this.attachedWebContents = null;
    }
  }

  isAttached(): boolean {
    return this.attachedWebContents != null && !this.attachedWebContents.isDestroyed();
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
    this.attachedWebContents = null;
    this.pty.dispose();
  }

  /** See Pty.disposeAndDestroySession — for when the terminal is actually
   * being deleted, not just detached (app quit, dev restart, reload). */
  disposeAndDestroySession(): void {
    this.attachedWebContents = null;
    this.pty.disposeAndDestroySession();
  }

  getCols(): number {
    return this.cols;
  }

  getRows(): number {
    return this.rows;
  }
}
