import * as pty from "node-pty";
import { resolvePtySpawn } from "./ptyShell";

// Direct shell spawn (Orca-style). PtySession + xterm scrollback handle
// reconnect while the app is running; no tmux wrapper.
//
// A tmux wrapper was tried (2026-08-27, quit/relaunch persistence) and
// reverted (2026-08-28): tmux is itself a terminal multiplexer that
// redraws its pane by diffing screen state, not by streaming clean
// scroll-index escapes — a rich TUI on top of it (e.g. Claude Code's CLI,
// which repaints an in-place viewport) produces duplicated/misaligned
// scrollback in xterm.js's own buffer ("double scroll", can't see prior
// output) and occasional mis-rendered wide/Unicode glyphs ("???") during
// tmux's own resize/redraw recalculation. Matches this project's own
// established rule (.cursor/skills/workspace-ref-port/SKILL.md): don't
// reintroduce a tmux wrapper, spawn the login shell directly like Orca.

export interface PtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
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

    // A GUI app launched via Finder/Dock/`open` gets minimal env — no
    // LANG/LC_ALL, minimal PATH. Force UTF-8 so wide (Hangul, CJK) cells
    // measure correctly in xterm.
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
    const { file, args, cwd } = resolvePtySpawn(this.cwd);

    this.child = pty.spawn(file, args, {
      name: "xterm-256color",
      cols: this.cols,
      rows: this.rows,
      cwd,
      env,
      // Raw bytes out, not decoded strings — matches the Rust side, which
      // reads raw bytes and lets the frontend/xterm.js decode.
      encoding: null,
    });

    // node-pty's own types say onData delivers `string` — that's only
    // true when `encoding` isn't explicitly nulled out. With
    // `encoding: null` above it actually hands back a raw Buffer; the
    // cast reflects that actual runtime behavior, not the type.
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

  /** No tmux session to separately tear down — same as dispose(). Kept as
   * a distinct method so call sites (terminal actually deleted, vs. just
   * detached on app quit/reload) don't need to change. */
  disposeAndDestroySession(): void {
    this.dispose();
  }
}
