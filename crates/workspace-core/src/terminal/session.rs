use std::path::PathBuf;

use crate::terminal::pty::Pty;

pub struct TerminalSession {
    id: u32,
    pty: Pty,
    cols: u16,
    rows: u16,
}

impl TerminalSession {
    pub fn new(id: u32, cols: u16, rows: u16, cwd: Option<PathBuf>) -> Self {
        Self {
            id,
            pty: Pty::new(cols, rows, cwd),
            cols,
            rows,
        }
    }

    pub fn id(&self) -> u32 {
        self.id
    }

    pub fn cols(&self) -> u16 {
        self.cols
    }

    pub fn rows(&self) -> u16 {
        self.rows
    }

    pub fn start(&self) {
        self.pty.start();
    }

    pub fn write(&self, data: &[u8]) {
        self.pty.write(data);
    }

    pub fn resize(&mut self, cols: u16, rows: u16) {
        self.cols = cols.max(1);
        self.rows = rows.max(1);
        self.pty.resize(self.cols, self.rows);
    }

    /// Drain all pending PTY output chunks into a single buffer.
    pub fn drain_output(&self) -> Vec<u8> {
        let mut out = Vec::new();
        while let Some(chunk) = self.pty.try_recv() {
            out.extend_from_slice(&chunk);
        }
        out
    }

    /// Returns individual output chunks (for event-per-chunk emission).
    pub fn drain_chunks(&self) -> Vec<Vec<u8>> {
        let mut chunks = Vec::new();
        while let Some(chunk) = self.pty.try_recv() {
            chunks.push(chunk);
        }
        chunks
    }
}
