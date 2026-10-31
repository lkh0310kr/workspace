import type { WebContents } from "electron";
import { StringDecoder } from "node:string_decoder";
import { Pty } from "./pty";
import { trimTerminalSessionBufferToByteLimit } from "../shared/terminal-session-buffers";
import { appendTerminalLog, reprTerminalBytesMain } from "./terminalDebugLog";
import { extractOnlyTerminalQueryReplies } from "../shared/terminal-query-reply";
import { TerminalQueryReplyEchoFilter } from "../shared/terminal-query-reply-echo";

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
  private decoder = new StringDecoder("utf8");

  appendUtf8(data: Buffer, transform: (text: string) => string = (text) => text): { seq: number; text: string } {
    const str = transform(this.decoder.write(data));
    this.seq++;
    if (str.length > 0) {
      this.chunks.push(str);
      this.totalChars += str.length;
      while (this.totalChars > REPLAY_MAX_CHARS && this.chunks.length > 1) {
        const removed = this.chunks.shift()!;
        this.totalChars -= removed.length;
      }
    }
    return { seq: this.seq, text: str };
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
  private queryReplyEchoFilter = new TerminalQueryReplyEchoFilter();
  private attachedWebContents: WebContents | null = null;
  private wasEverAttached = false;
  private onOutputUtf8: ((terminalId: number, chunk: string) => void) | null = null;

  constructor(id: number, pty: Pty, cols: number, rows: number) {
    this.id = id;
    this.pty = pty;
    this.cols = cols;
    this.rows = rows;
    pty.onData((data) => {
      const { seq, text } = this.replay.appendUtf8(data, (decoded) => this.queryReplyEchoFilter.filter(decoded));
      if (text.length > 0) {
        this.onOutputUtf8?.(this.id, text)
      }
      appendTerminalLog({
        sessionId: "terminal",
        timestamp: Date.now(),
        location: "main:pty:read",
        message: "from-shell",
        terminalId: this.id,
        data: { bytes: reprTerminalBytesMain(data), length: data.length, seq },
      });
      this.pushLiveOutput(seq, Buffer.from(text, "utf8"));
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

  async connect(webContents: WebContents): Promise<PtyConnectResult> {
    const attachment = await this.pty.attach();
    if (attachment.existed && this.replay.snapshot().replay.length === 0 && attachment.snapshot.length > 0) {
      this.replay.appendUtf8(attachment.snapshot);
    }
    this.attachedWebContents = webContents;
    const isReattach = this.wasEverAttached || attachment.existed;
    this.wasEverAttached = true;
    const { replay, lastSeq } = this.replay.snapshot();
    this.pty.activate();
    return {
      id: this.id,
      snapshot: replay || attachment.snapshot.toString("utf8"),
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
    const text = data.toString("utf8");
    const replies = extractOnlyTerminalQueryReplies(text);
    if (replies) {
      for (const reply of replies) this.queryReplyEchoFilter.expect(reply);
    }
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
    // Wait for xterm's first real FitAddon measurement. Starting the login
    // shell at the persisted 120x40 placeholder briefly renders a bogus
    // prompt, then redraws it after SIGWINCH (visible as a stray `%` line
    // and destructive to full-screen TUI apps).
    try {
      this.pty.start();
    } catch (err) {
      appendTerminalLog({
        sessionId: "terminal",
        timestamp: Date.now(),
        location: "main:pty:spawn",
        message: "failed",
        terminalId: this.id,
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      console.error(`[pty] failed to start terminal ${this.id}:`, err);
    }
  }

  setOnOutputUtf8(listener: ((terminalId: number, chunk: string) => void) | null): void {
    this.onOutputUtf8 = listener
  }

  dispose(): void {
    this.attachedWebContents = null;
    this.onOutputUtf8 = null
    this.pty.dispose();
  }

  /** See Pty.disposeAndDestroySession — for when the terminal is actually
   * being deleted, not just detached (app quit, dev restart, reload). */
  disposeAndDestroySession(): void {
    this.attachedWebContents = null;
    this.onOutputUtf8 = null;
    this.pty.disposeAndDestroySession();
  }

  getCols(): number {
    return this.cols;
  }

  getRows(): number {
    return this.rows;
  }

  /** Main-process replay fallback when the renderer pane is not mounted at quit. */
  getReplaySnapshot(): string {
    return trimTerminalSessionBufferToByteLimit(this.replay.snapshot().replay);
  }
}
