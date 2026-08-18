use std::cell::RefCell;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread;

use portable_pty::{CommandBuilder, PtySize, native_pty_system};

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
}

impl Pty {
    pub fn new(cols: u16, rows: u16) -> Self {
        Self {
            inner: RefCell::new(None),
            cols: RefCell::new(cols),
            rows: RefCell::new(rows),
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

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let mut cmd = CommandBuilder::new(shell);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair.slave.spawn_command(cmd).expect("failed to spawn shell");

        let writer = pair
            .master
            .take_writer()
            .expect("failed to take pty writer (only callable once)");

        let mut reader = pair.master.try_clone_reader().expect("failed to clone pty reader");
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn pty_accepts_multiple_writes() {
        let pty = Pty::new(80, 24);
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
        assert!(text.contains("hello"), "expected first write output, got: {text}");
        assert!(text.contains("world"), "expected second write output, got: {text}");
    }
}
