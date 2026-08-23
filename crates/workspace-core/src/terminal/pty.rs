use std::cell::RefCell;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::mpsc;
use std::thread;

use portable_pty::{CommandBuilder, PtySize, native_pty_system};

/// Absolute paths only — deliberately not a PATH lookup. A GUI app
/// launched from Finder/Dock gets a minimal PATH (this is the same class
/// of issue `new_default_prog`'s login-shell comment below documents for
/// the shell itself); resolving `tmux` by name would silently fail to
/// find a Homebrew install in exactly that launch context. Verified
/// empirically (not assumed) that once tmux itself is found and run, the
/// *pane* shell it spawns is unaffected by this and picks up the full
/// login-shell PATH regardless of tmux's own inherited environment.
const TMUX_CANDIDATES: &[&str] = &[
    "/opt/homebrew/bin/tmux",
    "/usr/local/bin/tmux",
    "/opt/local/bin/tmux",
    "/usr/bin/tmux",
];

fn tmux_binary() -> Option<&'static Path> {
    static CELL: OnceLock<Option<PathBuf>> = OnceLock::new();
    CELL.get_or_init(|| {
        TMUX_CANDIDATES
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_file())
    })
    .as_deref()
}

struct PtyInner {
    master: Box<dyn portable_pty::MasterPty + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    output_rx: mpsc::Receiver<Vec<u8>>,
    writer: RefCell<Box<dyn Write + Send>>,
}

pub struct Pty {
    inner: RefCell<Option<PtyInner>>,
    cols: RefCell<u16>,
    rows: RefCell<u16>,
    cwd: Option<PathBuf>,
    /// When set (and tmux is installed), the shell runs inside
    /// `tmux new-session -A -s <session_key>` instead of directly — the
    /// tmux *server* that creates is a separate, independently-running
    /// process the OS reparents to init, not a child of ours, so it (and
    /// the shell running inside it) survives this app exiting or being
    /// rebuilt. The next launch reattaches to the same session by using
    /// the same key, rather than starting a fresh shell. `None` (or no
    /// tmux binary found) falls back to today's plain-shell behavior.
    session_key: Option<String>,
}

impl Pty {
    pub fn new(cols: u16, rows: u16, cwd: Option<PathBuf>, session_key: Option<String>) -> Self {
        Self {
            inner: RefCell::new(None),
            cols: RefCell::new(cols),
            rows: RefCell::new(rows),
            cwd,
            session_key,
        }
    }

    fn ensure_open(&self) {
        let mut guard = self.inner.borrow_mut();
        if guard.is_some() {
            return;
        }

        let cols = *self.cols.borrow();
        let rows = *self.rows.borrow();
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("failed to open pty");

        let mut cmd = match (&self.session_key, tmux_binary()) {
            (Some(key), Some(tmux)) => {
                // `-A`: attach if `key` already has a live session
                // (survives-rebuild path), create it otherwise. `-c` only
                // takes effect on creation — tmux ignores it when
                // reattaching, which is exactly right: an already-running
                // session keeps whatever cwd it's actually sitting in.
                // tmux's own default (`default-command` empty) is to run
                // the pane shell as a *login* shell via `default-shell`,
                // so this gets the same `/etc/zprofile`/path_helper
                // behavior `new_default_prog` exists for below, without
                // needing an explicit flag for it — confirmed empirically
                // by spawning tmux under a deliberately minimal PATH and
                // checking the pane shell's own PATH still picked up
                // Homebrew's `/opt/homebrew/bin`.
                let mut c = CommandBuilder::new(tmux);
                c.arg("new-session");
                c.arg("-A");
                c.arg("-s");
                c.arg(key);
                if let Some(cwd) = &self.cwd {
                    c.arg("-c");
                    c.arg(cwd);
                }
                // `CommandBuilder::as_command()` (verified by reading
                // portable_pty's source) always does `env_clear()` and
                // only re-adds `SHELL` itself — HOME is never set unless
                // we set it. That's silently harmless for the plain
                // `new_default_prog()` path below (its login-shell re-
                // derives HOME from the password database before sourcing
                // rc files), but tmux's *own* forked pane shell doesn't go
                // through that same path — without HOME its `~/.zshrc`
                // lookup resolves against an empty/root HOME and silently
                // fails to source it, which is exactly what happened when
                // this was tested here without this fix (bare fallback
                // prompt, no user rc customizations). Read from our own
                // process env, same as a normal desktop launch would have.
                if let Ok(home) = std::env::var("HOME") {
                    c.env("HOME", home);
                }
                if let Ok(user) = std::env::var("USER") {
                    c.env("USER", user);
                }
                c
            }
            _ => {
                // `new_default_prog` (not `new(shell)`) is what makes
                // `portable_pty` spawn the shell as a *login* shell (it
                // prefixes argv0 with `-`, same convention Terminal.app/
                // iTerm2 use) — without that, only `.zshrc` runs, never
                // `/etc/zprofile` (which runs `path_helper` to pull in
                // `/etc/paths.d/*`, e.g. Homebrew's `/opt/homebrew/bin`)
                // or the user's own `~/.zprofile`, so anything relying on
                // either (like a `.zshrc` that calls `brew` directly,
                // assuming it's already on PATH) breaks with "command not
                // found" in a way a real terminal never would.
                let mut c = CommandBuilder::new_default_prog();
                if let Some(cwd) = &self.cwd {
                    c.cwd(cwd);
                }
                c
            }
        };
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        // A GUI app launched via Finder/Dock/`open` gets no LANG/LC_ALL at
        // all (confirmed empirically: `launchctl getenv LANG` returns
        // nothing in that launch context, unlike a shell-launched
        // process) — same class of "GUI launch context is missing
        // environment a terminal app needs" issue TMUX_CANDIDATES' doc
        // comment describes for PATH. Without a UTF-8 locale, tmux does
        // not consider itself UTF-8-aware, which corrupts wide (Hangul,
        // CJK) cells specifically when it redraws its saved grid from
        // scratch — e.g. on `-A` reattach after the app restarts, not on
        // a fresh session's live passthrough, which is why this only
        // showed up after a relaunch. Prefer the real env value if this
        // process happens to have one (a terminal-launched dev build
        // would), but always fall back to a real UTF-8 locale rather than
        // leaving it unset.
        let locale = std::env::var("LANG")
            .ok()
            .filter(|v| v.to_uppercase().contains("UTF-8"))
            .unwrap_or_else(|| "en_US.UTF-8".to_string());
        cmd.env("LANG", &locale);
        cmd.env("LC_ALL", &locale);

        let child = pair
            .slave
            .spawn_command(cmd)
            .expect("failed to spawn shell");

        let writer = pair
            .master
            .take_writer()
            .expect("failed to take pty writer (only callable once)");

        let mut reader = pair
            .master
            .try_clone_reader()
            .expect("failed to clone pty reader");
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(size) => {
                        if tx.send(buffer[..size].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        *guard = Some(PtyInner {
            master: pair.master,
            _child: child,
            output_rx: rx,
            writer: RefCell::new(writer),
        });
    }

    pub fn resize(&self, cols: u16, rows: u16) {
        *self.cols.borrow_mut() = cols;
        *self.rows.borrow_mut() = rows;
        if let Some(inner) = self.inner.borrow().as_ref() {
            let _ = inner.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }

    pub fn start(&self) {
        self.ensure_open();
    }

    pub fn write(&self, data: &[u8]) {
        if data.is_empty() {
            return;
        }
        self.ensure_open();
        let guard = self.inner.borrow();
        if let Some(inner) = guard.as_ref() {
            let mut writer = inner.writer.borrow_mut();
            let _ = writer.write_all(data);
            let _ = writer.flush();
        }
    }

    pub fn try_recv(&self) -> Option<Vec<u8>> {
        let guard = self.inner.borrow();
        let inner = guard.as_ref()?;
        match inner.output_rx.try_recv() {
            Ok(bytes) => Some(bytes),
            Err(mpsc::TryRecvError::Empty) => None,
            Err(mpsc::TryRecvError::Disconnected) => None,
        }
    }
}

impl Drop for Pty {
    fn drop(&mut self) {
        if let (Some(key), Some(tmux)) = (&self.session_key, tmux_binary()) {
            // `portable_pty`'s own `UnixMasterWriter::drop()` (verified by
            // reading its source) deliberately writes a trailing
            // newline+EOF byte into the pty master when the writer is
            // dropped, so a plain shell exits promptly on close. When the
            // child is `tmux attach` instead of a raw shell, that EOF
            // byte gets forwarded *through* tmux into the pane's own
            // shell as a literal Ctrl-D keystroke — which exits that
            // shell too, destroying the persisted session this feature
            // exists to keep alive. Confirmed by direct testing: without
            // this, the session the test expects to survive a reconnect
            // was gone by the time of the second attach. Detaching the
            // client cleanly first (before the field-drop below runs the
            // writer's own Drop) means nothing is left attached to
            // forward that byte into the pane by the time it's sent.
            // `-s` (target *session*), not `-t` (target *client*) — we
            // only know the session name, and want every client attached
            // to it detached, not one specific client identifier.
            let _ = std::process::Command::new(tmux)
                .args(["detach-client", "-s", key])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn pty_accepts_multiple_writes() {
        let pty = Pty::new(80, 24, None, None);
        pty.start();

        pty.write(b"echo hello\n");
        thread::sleep(Duration::from_millis(200));
        pty.write(b"echo world\n");
        thread::sleep(Duration::from_millis(200));

        let mut output = Vec::new();
        while let Some(chunk) = pty.try_recv() {
            output.extend_from_slice(&chunk);
        }

        let text = String::from_utf8_lossy(&output);
        assert!(
            text.contains("hello"),
            "expected first write output, got: {text}"
        );
        assert!(
            text.contains("world"),
            "expected second write output, got: {text}"
        );
    }

    // Exercises the actual persistence guarantee this whole feature exists
    // for: a second, entirely independent `Pty` using the same session key
    // must see state set by the first one, proving reattachment (not a
    // fresh shell) happened. Only runs when tmux is actually installed —
    // `cargo test` shouldn't fail in an environment without it.
    #[test]
    fn pty_tmux_session_persists_across_reconnect() {
        let Some(tmux) = tmux_binary() else {
            eprintln!("tmux not found, skipping persistence test");
            return;
        };
        let key = format!("workspace-core-test-{}", std::process::id());

        {
            let pty = Pty::new(80, 24, None, Some(key.clone()));
            pty.start();
            // The tmux client needs time to actually attach (handshake,
            // initial screen redraw) before it's forwarding keystrokes to
            // the pane's shell — writing immediately after `start()` races
            // that and can lose input.
            thread::sleep(Duration::from_millis(1000));
            pty.write(b"export PERSIST_MARKER=survived\n");
            thread::sleep(Duration::from_millis(500));
        }
        // `pty` (and the tmux client process it spawned) is dropped here —
        // the tmux *server* and the shell running inside the session must
        // outlive that, same as it must outlive this whole app exiting.
        thread::sleep(Duration::from_millis(300));

        let pty2 = Pty::new(80, 24, None, Some(key.clone()));
        pty2.start();
        thread::sleep(Duration::from_millis(1000));
        pty2.write(b"echo MARKER_IS=$PERSIST_MARKER\n");
        thread::sleep(Duration::from_millis(500));

        let mut output = Vec::new();
        while let Some(chunk) = pty2.try_recv() {
            output.extend_from_slice(&chunk);
        }
        let text = String::from_utf8_lossy(&output);

        let _ = std::process::Command::new(tmux)
            .args(["kill-session", "-t", &key])
            .status();

        assert!(
            text.contains("MARKER_IS=survived"),
            "expected the second connection to see state set by the first (proving \
             reattachment, not a fresh shell), got: {text}"
        );
    }
}
