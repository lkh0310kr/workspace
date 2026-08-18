use alacritty_terminal::grid::{Dimensions, GridCell};
use alacritty_terminal::term::cell::Flags;
use alacritty_terminal::term::Term;

use find::FindState;
use renderer::atlas_gpu::{GlyphUv, PackedAtlas, scale_key};
use renderer::color::{is_selected, resolve_bg, resolve_fg};
use renderer::damage::{DirtyRect, cursor_point, cursor_visible};
use renderer::pipeline::{BgInstance, GlyphInstance};
use screen::TerminalListener;
use theme::{Rgb8, Theme};
use url::UrlDetector;

pub struct GridRenderer {
    pub width: u32,
    pub height: u32,
    atlas: PackedAtlas,
    pub theme: Theme,
    pub find: FindState,
    pub preedit: String,
    url_detector: UrlDetector,
    bg_instances: Vec<BgInstance>,
    glyph_instances: Vec<GlyphInstance>,
    cols: usize,
    rows: usize,
    needs_full_clear: bool,
}

impl GridRenderer {
    pub fn new(width: u32, height: u32, theme: Theme, scale: f32) -> Self {
        let atlas = PackedAtlas::get(scale_key(scale));
        let cols = atlas.cols_for_width(width) as usize;
        let rows = atlas.rows_for_height(height) as usize;
        Self {
            width,
            height,
            atlas,
            theme,
            find: FindState::new(),
            preedit: String::new(),
            url_detector: UrlDetector::new(),
            bg_instances: Vec::with_capacity(cols * rows),
            glyph_instances: Vec::with_capacity(cols * rows),
            cols,
            rows,
            needs_full_clear: true,
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.width = width;
        self.height = height;
        self.cols = self.atlas.cols_for_width(width) as usize;
        self.rows = self.atlas.rows_for_height(height) as usize;
        self.bg_instances.clear();
        self.glyph_instances.clear();
        self.needs_full_clear = true;
    }

    pub fn cell_width(&self) -> f32 {
        self.atlas.cell_width as f32
    }

    pub fn cell_height(&self) -> f32 {
        self.atlas.cell_height as f32
    }

    pub fn cols(&self) -> u16 {
        self.cols as u16
    }

    pub fn rows(&self) -> u16 {
        self.rows as u16
    }

    pub fn render_full(&mut self, term: &Term<TerminalListener>) {
        self.glyph_instances.clear();
        self.bg_instances.clear();
        self.bg_instances.reserve(self.cols * self.rows);
        let rows = term.screen_lines().min(self.rows);
        let cols = term.columns().min(self.cols);
        for row in 0..rows {
            self.build_row(term, row, 0, cols.saturating_sub(1));
        }
        self.append_cursor(term);
        self.append_preedit(term);
        self.needs_full_clear = true;
    }

    pub fn render_damage(&mut self, term: &Term<TerminalListener>, dirty: &[DirtyRect]) {
        self.glyph_instances.clear();
        self.bg_instances.clear();
        for rect in dirty {
            for row in rect.line_start..=rect.line_end.min(term.screen_lines().saturating_sub(1)) {
                self.build_row(
                    term,
                    row,
                    rect.col_start,
                    rect.col_end.min(term.columns().saturating_sub(1)),
                );
            }
        }
        self.append_cursor(term);
        self.append_preedit(term);
        self.needs_full_clear = false;
    }

    pub fn fill_background_only(&mut self) {
        self.bg_instances.clear();
        self.glyph_instances.clear();
        self.bg_instances.push(BgInstance {
            rect: [0.0, 0.0, self.width as f32, self.height as f32],
            color: rgb_to_f32(self.theme.background),
        });
        self.needs_full_clear = true;
    }

    pub fn take_draw_data(&mut self) -> (Vec<BgInstance>, Vec<GlyphInstance>, bool) {
        let clear = self.needs_full_clear;
        self.needs_full_clear = false;
        (
            std::mem::take(&mut self.bg_instances),
            std::mem::take(&mut self.glyph_instances),
            clear,
        )
    }

    fn build_row(&mut self, term: &Term<TerminalListener>, row: usize, col_start: usize, col_end: usize) {
        let grid = term.grid();
        let row_data = &grid[alacritty_terminal::index::Line(row as i32)];

        let url_ranges = {
            let mut line_text = String::with_capacity(col_end - col_start + 1);
            for col in col_start..=col_end {
                line_text.push(row_data[alacritty_terminal::index::Column(col)].c);
            }
            if line_text.contains("http") || line_text.contains("ftp") {
                self.url_detector.ranges_in_line(&line_text)
            } else {
                Vec::new()
            }
        };

        let cw = self.atlas.cell_width as f32;
        let ch = self.atlas.cell_height as f32;

        for col in col_start..=col_end {
            let cell = &row_data[alacritty_terminal::index::Column(col)];
            let mut fg = resolve_fg(cell, term.colors(), &self.theme);
            let mut bg = resolve_bg(cell, term.colors(), &self.theme);

            if self.find.is_match_cell(row, col) {
                bg = self.theme.find_match;
            } else if self.find.is_find_cell(row, col) {
                bg = Rgb8 {
                    r: bg.r.saturating_add(20),
                    g: bg.g.saturating_add(15),
                    b: bg.b,
                };
            }

            if url_ranges.iter().any(|u| col >= u.col_start && col < u.col_end) {
                fg = self.url_detector.url_color(&self.theme);
            }

            if is_selected(term, row, col) {
                fg = self.theme.selection_fg;
                bg = self.theme.selection_bg;
            }

            let x = col as f32 * cw;
            let y = row as f32 * ch;
            self.bg_instances.push(BgInstance {
                rect: [x, y, cw, ch],
                color: rgb_to_f32(bg),
            });

            if cell.c != ' ' && cell.c != '\0' {
                if let Some(uv) = self.atlas.uv(cell.c) {
                    self.push_glyph(cell.c, x, y, cw, ch, fg, uv);
                }
            }

            if cell.flags().contains(Flags::UNDERLINE)
                || url_ranges.iter().any(|u| col >= u.col_start && col < u.col_end)
            {
                let uy = y + ch - 2.0;
                self.bg_instances.push(BgInstance {
                    rect: [x, uy, cw, 1.0],
                    color: rgb_to_f32(fg),
                });
            }
        }
    }

    fn push_glyph(
        &mut self,
        _ch: char,
        cell_x: f32,
        cell_y: f32,
        _cw: f32,
        cell_h: f32,
        fg: Rgb8,
        uv: GlyphUv,
    ) {
        let gx = cell_x + uv.bearing_x as f32;
        let gy = cell_y + (cell_h - uv.bearing_y as f32 - uv.height as f32);
        let w = uv.width.max(1) as f32;
        let h = uv.height.max(1) as f32;
        self.glyph_instances.push(GlyphInstance {
            rect: [gx, gy, w, h],
            uv: [uv.u0, uv.v0, uv.u1, uv.v1],
            color: rgb_to_f32(fg),
        });
    }

    fn append_cursor(&mut self, term: &Term<TerminalListener>) {
        if !cursor_visible(term) {
            return;
        }
        let (col, row) = cursor_point(term);
        let cw = self.atlas.cell_width as f32;
        let ch = self.atlas.cell_height as f32;
        self.bg_instances.push(BgInstance {
            rect: [col as f32 * cw, row as f32 * ch, cw, ch],
            color: rgb_to_f32(self.theme.cursor),
        });
    }

    fn append_preedit(&mut self, term: &Term<TerminalListener>) {
        if self.preedit.is_empty() {
            return;
        }
        let (col, row) = cursor_point(term);
        let cw = self.atlas.cell_width as f32;
        let ch = self.atlas.cell_height as f32;
        let x = col as f32 * cw;
        let y = row as f32 * ch;
        let w = (self.preedit.chars().count() as f32).max(1.0) * cw;
        self.bg_instances.push(BgInstance {
            rect: [x, y, w, ch],
            color: [60.0 / 255.0, 60.0 / 255.0, 60.0 / 255.0, 1.0],
        });
        let preedit: String = self.preedit.clone();
        let fg = self.theme.foreground;
        let cell_h = self.atlas.cell_height as f32;
        let mut offset = 0.0;
        for ch in preedit.chars() {
            if let Some(uv) = self.atlas.uv(ch) {
                self.push_glyph(ch, x + offset, y, cw, cell_h, fg, uv);
            }
            offset += cw;
        }
    }
}

fn rgb_to_f32(c: Rgb8) -> [f32; 4] {
    [
        c.r as f32 / 255.0,
        c.g as f32 / 255.0,
        c.b as f32 / 255.0,
        1.0,
    ]
}
