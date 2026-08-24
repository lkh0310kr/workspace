use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use alacritty_terminal::{
    event::{Event, EventListener},
    grid::Dimensions,
    index::{Column, Line, Point, Side},
    selection::{Selection, SelectionType},
    term::{Config, Term, TermMode},
    vte::ansi,
};

#[derive(Clone)]
pub struct TerminalListener {
    pub bell: Arc<AtomicBool>,
}

impl Default for TerminalListener {
    fn default() -> Self {
        Self {
            bell: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl EventListener for TerminalListener {
    fn send_event(&self, event: Event) {
        if matches!(event, Event::Bell) {
            self.bell.store(true, Ordering::Relaxed);
        }
    }
}

pub struct TerminalSize {
    pub rows: usize,
    pub cols: usize,
}

impl Dimensions for TerminalSize {
    fn total_lines(&self) -> usize {
        self.rows
    }

    fn screen_lines(&self) -> usize {
        self.rows
    }

    fn columns(&self) -> usize {
        self.cols
    }
}

pub struct Screen {
    pub term: Term<TerminalListener>,
    processor: ansi::Processor,
    listener: TerminalListener,
}

impl Screen {
    pub fn new(cols: u16, rows: u16) -> Self {
        let size = TerminalSize {
            rows: rows as usize,
            cols: cols as usize,
        };
        let listener = TerminalListener::default();
        let term = Term::new(
            Config {
                scrolling_history: 10_000,
                ..Default::default()
            },
            &size,
            listener.clone(),
        );
        let processor = ansi::Processor::new();

        Self {
            term,
            processor,
            listener,
        }
    }

    pub fn process(&mut self, bytes: &[u8]) {
        self.processor.advance(&mut self.term, bytes);
    }

    pub fn resize(&mut self, cols: u16, rows: u16) {
        let size = TerminalSize {
            rows: rows as usize,
            cols: cols as usize,
        };
        self.term.resize(size);
    }

    pub fn scroll_lines(&mut self, lines: i32) {
        use alacritty_terminal::grid::Scroll;
        if lines > 0 {
            self.term.scroll_display(Scroll::Delta(lines));
        } else if lines < 0 {
            self.term.scroll_display(Scroll::Delta(lines));
        }
    }

    pub fn mouse_mode(&self) -> bool {
        self.term
            .mode()
            .intersects(TermMode::MOUSE_REPORT_CLICK | TermMode::MOUSE_DRAG | TermMode::MOUSE_MOTION)
    }

    pub fn sgr_mouse(&self) -> bool {
        self.term.mode().contains(TermMode::SGR_MOUSE)
    }

    pub fn selection_to_string(&self) -> Option<String> {
        self.term.selection_to_string()
    }

    pub fn start_selection(&mut self, col: usize, row: usize) {
        let point = Point::new(Line(row as i32), Column(col));
        self.term.selection = Some(Selection::new(SelectionType::Simple, point, Side::Left));
    }

    pub fn update_selection(&mut self, col: usize, row: usize) {
        if let Some(selection) = self.term.selection.as_mut() {
            let point = Point::new(Line(row as i32), Column(col));
            selection.update(point, Side::Left);
        }
    }

    pub fn clear_selection(&mut self) {
        self.term.selection = None;
    }

    pub fn has_selection(&self) -> bool {
        self.term.selection.is_some()
    }

    pub fn take_bell(&mut self) -> bool {
        self.listener.bell.swap(false, Ordering::Relaxed)
    }
}
