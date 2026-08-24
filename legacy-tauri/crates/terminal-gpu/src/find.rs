use alacritty_terminal::grid::Dimensions;
use alacritty_terminal::index::{Column, Line};
use alacritty_terminal::term::Term;

use screen::TerminalListener;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GridMatch {
    pub row: usize,
    pub col_start: usize,
    pub col_end: usize,
}

#[derive(Clone)]
pub struct FindState {
    pub query: String,
    pub matches: Vec<GridMatch>,
    pub current: Option<usize>,
}

impl FindState {
    pub fn new() -> Self {
        Self {
            query: String::new(),
            matches: Vec::new(),
            current: None,
        }
    }

    pub fn search(&mut self, term: &Term<TerminalListener>, query: &str) {
        self.query = query.to_string();
        self.matches.clear();
        self.current = None;

        if query.is_empty() {
            return;
        }

        let lower_query = query.to_lowercase();
        let cols = term.columns();
        let rows = term.screen_lines();

        for row in 0..rows {
            let mut line = String::new();
            let grid = term.grid();
            for col in 0..cols {
                line.push(grid[Line(row as i32)][Column(col)].c);
            }
            let lower_line = line.to_lowercase();
            let mut start = 0;
            while let Some(pos) = lower_line[start..].find(&lower_query) {
                let abs = start + pos;
                self.matches.push(GridMatch {
                    row,
                    col_start: abs,
                    col_end: abs + query.len(),
                });
                start = abs + 1;
            }
        }

        self.current = if self.matches.is_empty() {
            None
        } else {
            Some(0)
        };
    }

    pub fn next_match(&mut self) {
        if self.matches.is_empty() {
            return;
        }
        let current = self.current.unwrap_or(0);
        self.current = Some((current + 1) % self.matches.len());
    }

    pub fn prev_match(&mut self) {
        if self.matches.is_empty() {
            return;
        }
        let current = self.current.unwrap_or(0);
        self.current = Some((current + self.matches.len() - 1) % self.matches.len());
    }

    pub fn is_match_cell(&self, row: usize, col: usize) -> bool {
        self.matches.iter().enumerate().any(|(idx, m)| {
            row == m.row && col >= m.col_start && col < m.col_end && self.current == Some(idx)
        })
    }

    pub fn is_find_cell(&self, row: usize, col: usize) -> bool {
        self.matches.iter().any(|m| {
            row == m.row && col >= m.col_start && col < m.col_end
        })
    }
}
