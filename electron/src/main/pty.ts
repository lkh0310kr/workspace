import * as pty from "node-pty";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

// Direct TypeScript port of crates/workspace-core/src/terminal/pty.rs from
// the Tauri version of this app — every comment below explaining *why* a
// line exists is carried over from empirically-verified findings there,
// not re-derived. See that file's own history for how each was found.

// Absolute paths only — deliberately not a PATH lookup. A GUI app launched
// from Finder/Dock gets a minimal PATH; resolving `tmux` by name would
// silently fail to find a Homebrew install in exactly that launch context.
const TMUX_CANDIDATES = [
  "/opt/homebrew/bin/tmux",
  "/usr/local/bin/tmux",
  "/opt/local/bin/tmux",
  "/usr/bin/tmux",
];

let cachedTmuxBinary: string | null | undefined;

function tmuxBinary(): string | null {
  if (cachedTmuxBinary !== undefined) return cachedTmuxBinary;
  cachedTmuxBinary = TMUX_CANDIDATES.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) ?? null;
  return cachedTmuxBinary;
}

let cachedTmuxConfPath: string | null | undefined;

// tmux's own status bar is redundant with our own pane header. `-f <path>`
// only takes effect the *first* time it starts the (long-lived,
// cross-restart) tmux server — an already-running server predating this
// file needs one manual `tmux kill-server` to pick up changes.
//
// `mouse off` — iTerm2 / Terminal.app style: xterm.js owns click-drag
// selection (theme selection colors, selection stays until copy/click away).
// `mouse on` made tmux enter copy-mode on drag (yellow highlight, `[0/N]`
// position indicator, selection cleared on mouseup via copy-pipe-and-cancel).
// Wheel scroll uses xterm scrollback (`scrollback` rows + scrollLines in
// TerminalPane) instead of tmux copy-mode scrolling.
// If an old tmux server was started with `mouse on`, run `tmux kill-server`
// once so the next pane picks up this config.
function tmuxConfPath(): string | null {
  if (cachedTmuxConfPath !== undefined) return cachedTmuxConfPath;
  const home = os.homedir();
  if (!home) {
    cachedTmuxConfPath = null;
    return null;
  }
  const dir = path.join(home, "Library", "Application Support", "workspace-app");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const confPath = path.join(dir, "tmux.conf");
    fs.writeFileSync(confPath, "set-option -g status off\nset -g mouse off\n");
    cachedTmuxConfPath = confPath;
  } catch {
    cachedTmuxConfPath = null;
  }
  return cachedTmuxConfPath;
}

export interface PtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
  /** When set (and tmux is installed), the shell runs inside
   * `tmux new-session -A -s <sessionKey>` instead of directly — the tmux
   * *server* that creates is independent of our process, so it (and the
   * shell running inside it) survives this app exiting or being rebuilt.
   * The next launch reattaches to the same session by using the same key.
   */
  sessionKey?: string;
}

export class Pty {
  private child: pty.IPty | null = null;
  private cols: number;
  private rows: number;
  private cwd?: string;
  private sessionKey?: string;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private disposed = false;

  constructor(options: PtyOptions) {
    this.cols = options.cols;
    this.rows = options.rows;
    this.cwd = options.cwd;
    this.sessionKey = options.sessionKey;
  }

  onData(cb: (data: Buffer) => void): void {
    this.onDataCallback = cb;
  }

  private ensureOpen(): void {
    if (this.child) return;

    const tmux = this.sessionKey ? tmuxBinary() : null;

    let file: string;
    let args: string[];
    // A GUI app launched via Finder/Dock/`open` gets minimal env — no
    // LANG/LC_ALL, minimal PATH. Without a UTF-8 locale, tmux does not
    // consider itself UTF-8-aware, which corrupts wide (Hangul, CJK)
    // cells specifically when it redraws its saved grid from scratch
    // (e.g. on `-A` reattach after the app restarts).
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

    if (this.sessionKey && tmux) {
      file = tmux;
      args = [];
      const conf = tmuxConfPath();
      if (conf) args.push("-f", conf);
      args.push("new-session", "-A", "-s", this.sessionKey);
      // `-c` only takes effect on creation — tmux ignores it when
      // reattaching, which is exactly right: an already-running session
      // keeps whatever cwd it's actually sitting in.
      if (this.cwd) args.push("-c", this.cwd);
      // HOME/USER: node-pty spawns via the env we pass, which already
      // includes our full process.env (spread above) — unlike
      // portable_pty's CommandBuilder (which does env_clear() and only
      // re-adds SHELL), so this fix is inherently unnecessary here. Kept
      // as an explicit, defensive set anyway: if HOME/USER were ever
      // missing from process.env, tmux's own forked pane shell needs
      // them to find and source ~/.zshrc.
      if (process.env.HOME) env.HOME = process.env.HOME;
      if (process.env.USER) env.USER = process.env.USER;
    } else {
      // `-l`: run as a *login* shell (zsh/bash both support this flag) —
      // without it, only .zshrc runs, never /etc/zprofile (which runs
      // path_helper to pull in /etc/paths.d/*, e.g. Homebrew's
      // /opt/homebrew/bin) or the user's own ~/.zprofile. tmux's pane
      // shell doesn't need this passed explicitly — its own
      // default-shell already runs as a login shell.
      const shell = process.env.SHELL || "/bin/zsh";
      file = shell;
      args = ["-l"];
    }

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

  /** Detach the tmux client (if any) and tear down the pty. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const tmux = this.sessionKey ? tmuxBinary() : null;
    if (this.sessionKey && tmux) {
      // Detach the tmux *client* before killing our side of the pty —
      // ported 1:1 from pty.rs's Drop impl. There, portable_pty's own
      // writer explicitly wrote a trailing EOF byte into the pty master
      // on drop, which (with a raw shell attached) forwarded straight
      // through as a literal Ctrl-D and killed the persisted session.
      // Whether node-pty's own close path has an identical EOF-on-close
      // quirk hasn't been independently confirmed (see this file's test),
      // but detaching the client first is correct regardless: it's what
      // makes tmux itself understand this is a clean disconnect (session
      // + its shell kept alive) rather than a hangup, and there's nothing
      // to lose by doing it before tearing down our side either way.
      // `-s` (target *session*), not `-t` (target *client*) — we only
      // know the session name, and want every client attached to it
      // detached, not one specific client identifier.
      try {
        execFileSync(tmux, ["detach-client", "-s", this.sessionKey], {
          stdio: "ignore",
        });
      } catch {
        // No client attached, or session already gone — fine either way.
      }
    }
    try {
      this.child?.kill();
    } catch {
      // Already exited.
    }
    this.child = null;
  }
}
