use alacritty_terminal::{
    grid::GridCell,
    index::{Column, Line},
    selection::SelectionRange,
    term::cell::{Cell, Flags},
    term::Term,
    vte::ansi::{Color, NamedColor},
};

use screen::TerminalListener;
use theme::{Rgb8, Theme, indexed_color};

pub fn resolve_fg(cell: &Cell, colors: &alacritty_terminal::term::color::Colors, theme: &Theme) -> Rgb8 {
    let fg = if cell.flags().contains(Flags::INVERSE) {
        resolve_bg_color(cell.bg, colors, theme)
    } else {
        resolve_fg_color(cell.fg, colors, theme)
    };
    if cell.flags().contains(Flags::BOLD) {
        brighten(fg)
    } else {
        fg
    }
}

pub fn resolve_bg(cell: &Cell, colors: &alacritty_terminal::term::color::Colors, theme: &Theme) -> Rgb8 {
    if cell.flags().contains(Flags::INVERSE) {
        resolve_fg_color(cell.fg, colors, theme)
    } else {
        resolve_bg_color(cell.bg, colors, theme)
    }
}

fn resolve_fg_color(color: Color, _colors: &alacritty_terminal::term::color::Colors, theme: &Theme) -> Rgb8 {
    match color {
        Color::Spec(rgb) => rgb.into(),
        Color::Indexed(i) => indexed_color(i),
        Color::Named(named) => match named {
            NamedColor::Foreground => theme.foreground,
            NamedColor::Background => theme.background,
            NamedColor::Cursor => theme.cursor,
            other => theme.palette[(other as usize).min(15)],
        },
    }
}

fn resolve_bg_color(color: Color, colors: &alacritty_terminal::term::color::Colors, theme: &Theme) -> Rgb8 {
    match color {
        Color::Spec(rgb) => rgb.into(),
        Color::Indexed(i) => indexed_color(i),
        Color::Named(named) => {
            if let Some(rgb) = colors[named] {
                rgb.into()
            } else {
                match named {
                    NamedColor::Background => theme.background,
                    NamedColor::Foreground => theme.foreground,
                    other => theme.palette[(other as usize).min(15)],
                }
            }
        }
    }
}

fn brighten(c: Rgb8) -> Rgb8 {
    Rgb8 {
        r: c.r.saturating_add(30).min(255),
        g: c.g.saturating_add(30).min(255),
        b: c.b.saturating_add(30).min(255),
    }
}

pub fn is_selected(
    term: &Term<TerminalListener>,
    row: usize,
    col: usize,
) -> bool {
    let Some(selection) = term.selection.as_ref() else {
        return false;
    };
    let Some(range) = selection.to_range(term) else {
        return false;
    };
    let SelectionRange { start, end, .. } = range;
    let point = alacritty_terminal::index::Point::new(Line(row as i32), Column(col));
    point >= start && point <= end
}
