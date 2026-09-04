import * as pty from "node-pty";
import { resolvePtySpawnAttempts, type PtySpawnSpec } from "./ptyShell";

// Direct shell spawn (Orca-style). PtySession + xterm scrollback handle
// reconnect while the app is running; no tmux wrapper.

export interface PtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
}

type PtySpawnOptions = {
  cols: number;
  rows: number;
  env: Record<string, string | undefined>;
};

function spawnPtyWithFallback(attempts: PtySpawnSpec[], options: PtySpawnOptions): pty.IPty {
  const baseOpts = {
    name: "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    env: options.env,
    encoding: null as null,
    ...(process.platform === "win32" ? { useConptyDll: true as const } : {}),
  };

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      return pty.spawn(attempt.file, attempt.args, {
        ...baseOpts,
        cwd: attempt.cwd,
      });
    } catch (err) {
      lastError = err;
      if (i < attempts.length - 1) {
        console.warn(`[pty] spawn failed for ${attempt.file}, trying fallback`, err);
      }
    }
  }
  throw lastError ?? new Error("pty spawn: no attempts");
}

export class Pty {
  private child: pty.IPty | null = null;
  private cols: number;
  private rows: number;
  private cwd?: string;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private disposed = false;

  constructor(options: PtyOptions) {
    this.cols = options.cols;
    this.rows = options.rows;
    this.cwd = options.cwd;
  }

  onData(cb: (data: Buffer) => void): void {
    this.onDataCallback = cb;
  }

  private ensureOpen(): void {
    if (this.child) return;

    const existingLang = process.env.LANG;
    const locale =
      existingLang && existingLang.toUpperCase().includes("UTF-8") ? existingLang : "en_US.UTF-8";
    const env: { [key: string]: string | undefined } = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: locale,
      LC_ALL: locale,
    };
    const attempts = resolvePtySpawnAttempts(this.cwd);

    this.child = spawnPtyWithFallback(attempts, {
      cols: this.cols,
      rows: this.rows,
      env,
    });

    (this.child.onData as unknown as (cb: (data: Buffer) => void) => void)((data: Buffer) => {
      this.onDataCallback?.(data);
    });
  }

  start(): void {
    this.ensureOpen();
  }

  write(data: Buffer): void {
    if (data.length === 0) return;
    this.ensureOpen();
    this.child?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    try {
      this.child?.resize(cols, rows);
    } catch {
      // pty already exited — nothing to resize.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.child?.kill();
    } catch {
      // Already exited.
    }
    this.child = null;
  }

  disposeAndDestroySession(): void {
    this.dispose();
  }
}
