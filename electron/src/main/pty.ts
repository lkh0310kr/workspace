import * as pty from "node-pty";
import { execFileSync } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";

// Terminals live inside a tmux session named after their terminal id
// (see workspace.ts's tmuxSessionName), not directly inside this
// process's pty — closing the app, or the main process restarting on a
// dev file change, only kills the local tmux *client*; tmux's own
// default (`destroy-unattached off`) is to detach rather than tear the
// session down, so the shell (and anything running in it) keeps running
// on the OS until something explicitly kills the session. Falls back to
// a direct shell spawn (the previous, non-persistent behavior) if tmux
// can't be found at all.

// A GUI app launched via Finder/Dock (not a terminal) inherits a minimal
// PATH (/usr/bin:/bin:/usr/sbin:/sbin) that excludes Homebrew — same root
// cause as the LANG/LC_ALL forcing below, just for PATH instead of
// locale. `npm run dev` from an actual terminal already has a full PATH,
// but a packaged build opened normally wouldn't find tmux without this.
const TMUX_PATH_CANDIDATES = ["/opt/homebrew/bin/tmux", "/usr/local/bin/tmux", "/usr/bin/tmux"];

let tmuxBinaryCache: string | null | undefined;

function resolveTmuxBinary(): string | null {
  if (tmuxBinaryCache !== undefined) return tmuxBinaryCache;
  // Resolve to an absolute path always — node-pty forks/execs directly
  // rather than going through a shell, so whether a bare "tmux" would get
  // PATH-resolved at all depends on the native binding, not something to
  // rely on here.
  try {
    const resolved = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
    if (resolved) {
      tmuxBinaryCache = resolved;
      return tmuxBinaryCache;
    }
  } catch {
    // `which` itself not found, or tmux not on the current PATH — fall
    // through to the fixed candidates below.
  }
  for (const candidate of TMUX_PATH_CANDIDATES) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      tmuxBinaryCache = candidate;
      return tmuxBinaryCache;
    } catch {
      // Try the next candidate.
    }
  }
  tmuxBinaryCache = null;
  return null;
}

export interface PtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
  /** Stable per-terminal-id tmux session name (see workspace.ts). Ignored
   * (direct shell spawn instead) when tmux isn't available. */
  tmuxSessionName: string;
}

export class Pty {
  private child: pty.IPty | null = null;
  private cols: number;
  private rows: number;
  private cwd?: string;
  private tmuxSessionName: string;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private disposed = false;

  constructor(options: PtyOptions) {
    this.cols = options.cols;
    this.rows = options.rows;
    this.cwd = options.cwd;
    this.tmuxSessionName = options.tmuxSessionName;
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

    // `-l`: run as a *login* shell — without it, only .zshrc runs, never
    // /etc/zprofile (path_helper → Homebrew) or ~/.zprofile.
    const shell = process.env.SHELL || "/bin/zsh";

    const tmuxBinary = resolveTmuxBinary();
    const file = tmuxBinary ?? shell;
    const args = tmuxBinary
      ? [
          // -A: attach if the session already exists (reconnecting after
          // an app restart), otherwise create it fresh — one flag covers
          // both cases. -x/-y only take effect on fresh creation; tmux
          // resizes to fit an attaching client's actual pty size anyway.
          "new-session",
          "-A",
          "-s",
          this.tmuxSessionName,
          "-x",
          String(this.cols),
          "-y",
          String(this.rows),
          // Trailing shell-command, as ONE argv element (tmux parses it
          // itself) — only used when creating a session fresh; ignored
          // when attaching to one that already has a shell running.
          `${shell} -l`,
          // Chained command (tmux's own argv syntax splits on a literal
          // ";" element — nothing to do with shell quoting, there's no
          // shell in between since node-pty execs directly): tmux's
          // status bar ([session] window-list … hostname/clock) is meant
          // for driving tmux directly, not for a persistence layer the
          // user never sees as tmux — it showed up as literal garbage
          // text at the bottom of the terminal pane ("[workspace0:zsh*
          // ... 14:12 27-Aug-26"). Runs on every ensureOpen (create or
          // reattach), so it also self-heals sessions created before this
          // fix.
          ";",
          "set-option",
          "status",
          "off",
        ]
      : ["-l"];

    this.child = pty.spawn(file, args, {
      name: "xterm-256color",
      cols: this.cols,
      rows: this.rows,
      cwd: this.cwd,
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

  /** Detach only. If tmux-backed, the session (and everything running in
   * it) survives — this just ends the local client, exactly like closing
   * a real terminal window on a `tmux attach` session. Use this for
   * anything that isn't the user actually deleting the terminal (app
   * quit, a dev-mode main-process restart, a renderer reload). */
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

  /** The terminal is genuinely gone from the UI (closed tab, pruned from
   * every layout) — detach AND kill the underlying tmux session, or it'd
   * leak forever on the OS with nothing in the app able to reach it
   * again (terminal ids are never reused). No-op beyond dispose() when
   * tmux isn't available, since there's no session to kill. */
  disposeAndDestroySession(): void {
    this.dispose();
    const tmuxBinary = resolveTmuxBinary();
    if (!tmuxBinary) return;
    try {
      execFileSync(tmuxBinary, ["kill-session", "-t", this.tmuxSessionName], { stdio: "ignore" });
    } catch {
      // Already gone (never created, or already killed) — fine.
    }
  }
}
