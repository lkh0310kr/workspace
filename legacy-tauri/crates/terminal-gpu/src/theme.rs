use alacritty_terminal::vte::ansi::Rgb;

#[derive(Clone, Copy)]
pub struct Rgb8 {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl From<Rgb> for Rgb8 {
    fn from(rgb: Rgb) -> Self {
        Self {
            r: rgb.r,
            g: rgb.g,
            b: rgb.b,
        }
    }
}

#[derive(Clone)]
pub struct Theme {
    pub name: &'static str,
    pub background: Rgb8,
    pub foreground: Rgb8,
    pub cursor: Rgb8,
    pub selection_bg: Rgb8,
    pub selection_fg: Rgb8,
    pub find_match: Rgb8,
    pub url: Rgb8,
    pub palette: [Rgb8; 16],
}

impl Theme {
    pub fn default_dark() -> Self {
        Self {
            name: "default",
            background: Rgb8 {
                r: 12,
                g: 12,
                b: 12,
            },
            foreground: Rgb8 {
                r: 204,
                g: 204,
                b: 204,
            },
            cursor: Rgb8 {
                r: 204,
                g: 204,
                b: 204,
            },
            selection_bg: Rgb8 {
                r: 38,
                g: 79,
                b: 120,
            },
            selection_fg: Rgb8 {
                r: 255,
                g: 255,
                b: 255,
            },
            find_match: Rgb8 {
                r: 120,
                g: 90,
                b: 20,
            },
            url: Rgb8 {
                r: 100,
                g: 160,
                b: 255,
            },
            palette: [
                Rgb8 { r: 0, g: 0, b: 0 },
                Rgb8 { r: 205, g: 49, b: 49 },
                Rgb8 { r: 13, g: 188, b: 121 },
                Rgb8 { r: 229, g: 229, b: 16 },
                Rgb8 { r: 36, g: 114, b: 200 },
                Rgb8 { r: 188, g: 63, b: 188 },
                Rgb8 { r: 17, g: 168, b: 205 },
                Rgb8 { r: 229, g: 229, b: 229 },
                Rgb8 { r: 102, g: 102, b: 102 },
                Rgb8 { r: 241, g: 76, b: 76 },
                Rgb8 { r: 35, g: 209, b: 139 },
                Rgb8 { r: 245, g: 245, b: 67 },
                Rgb8 { r: 59, g: 142, b: 234 },
                Rgb8 { r: 214, g: 112, b: 214 },
                Rgb8 { r: 41, g: 184, b: 219 },
                Rgb8 { r: 255, g: 255, b: 255 },
            ],
        }
    }

    pub fn solarized_dark() -> Self {
        let mut theme = Self::default_dark();
        theme.name = "solarized-dark";
        theme.background = Rgb8 {
            r: 0,
            g: 43,
            b: 54,
        };
        theme.foreground = Rgb8 {
            r: 131,
            g: 148,
            b: 150,
        };
        theme
    }

    pub fn dracula() -> Self {
        let mut theme = Self::default_dark();
        theme.name = "dracula";
        theme.background = Rgb8 {
            r: 40,
            g: 42,
            b: 54,
        };
        theme.foreground = Rgb8 {
            r: 248,
            g: 248,
            b: 242,
        };
        theme
    }
}

pub fn indexed_color(index: u8) -> Rgb8 {
    if index < 16 {
        Theme::default_dark().palette[index as usize]
    } else if index < 232 {
        let index = index - 16;
        let r = index / 36;
        let g = (index / 6) % 6;
        let b = index % 6;
        let scale = |c: u8| if c == 0 { 0 } else { (c * 40 + 55) as u8 };
        Rgb8 {
            r: scale(r),
            g: scale(g),
            b: scale(b),
        }
    } else {
        let level = (index - 232) * 10 + 8;
        Rgb8 {
            r: level,
            g: level,
            b: level,
        }
    }
}
