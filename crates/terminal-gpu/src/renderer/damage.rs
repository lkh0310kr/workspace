use alacritty_terminal::{
    grid::Dimensions,
    index::{Column, Line},
    term::{TermDamage, TermMode},
    vte::ansi::CursorShape,
};
use alacritty_terminal::term::Term;

use screen::TerminalListener;

#[derive(Debug, Clone, Copy)]
pub struct DirtyRect {
    pub line_start: usize,
    pub line_end: usize,
    pub col_start: usize,
    pub col_end: usize,
}

impl DirtyRect {
    pub fn full(rows: usize, cols: usize) -> Self {
        Self {
            line_start: 0,
            line_end: rows.saturating_sub(1),
            col_start: 0,
            col_end: cols.saturating_sub(1),
        }
    }

    pub fn merge(self, other: Self) -> Self {
        Self {
            line_start: self.line_start.min(other.line_start),
            line_end: self.line_end.max(other.line_end),
            col_start: self.col_start.min(other.col_start),
            col_end: self.col_end.max(other.col_end),
        }
    }
}

pub fn collect_damage(term: &mut Term<TerminalListener>) -> Vec<DirtyRect> {
    let cols = term.columns();
    let rows = term.screen_lines();

    let damage = term.damage();
    let rects = match damage {
        TermDamage::Full => vec![DirtyRect::full(rows, cols)],
        TermDamage::Partial(iter) => iter
            .map(|d| DirtyRect {
                line_start: d.line,
                line_end: d.line,
                col_start: d.left,
                col_end: d.right,
            })
            .collect(),
    };

    if term.mode().contains(TermMode::SHOW_CURSOR) {
        let cursor = term.grid().cursor.point;
        let cursor_rect = DirtyRect {
            line_start: cursor.line.0 as usize,
            line_end: cursor.line.0 as usize,
            col_start: cursor.column.0,
            col_end: cursor.column.0,
        };
        if let Some(last) = rects.last().cloned() {
            let mut merged = rects;
            merged.push(cursor_rect);
            let combined = merged.into_iter().reduce(DirtyRect::merge).unwrap_or(last);
            term.reset_damage();
            return vec![combined];
        }
    }

    term.reset_damage();

    if rects.is_empty() {
        vec![]
    } else {
        vec![rects.into_iter().reduce(DirtyRect::merge).unwrap()]
    }
}

pub fn cursor_visible(term: &Term<TerminalListener>) -> bool {
    term.mode().contains(TermMode::SHOW_CURSOR)
        && term.cursor_style().shape != CursorShape::Hidden
}

pub fn cursor_point(term: &Term<TerminalListener>) -> (usize, usize) {
    let p = term.grid().cursor.point;
    (p.column.0, p.line.0 as usize)
}

pub fn grid_columns(term: &Term<TerminalListener>) -> usize {
    term.columns()
}

pub fn grid_rows(term: &Term<TerminalListener>) -> usize {
    term.screen_lines()
}

pub fn cell_at(term: &Term<TerminalListener>, row: usize, col: usize) -> char {
    let grid = term.grid();
    grid[Line(row as i32)][Column(col)].c
}
