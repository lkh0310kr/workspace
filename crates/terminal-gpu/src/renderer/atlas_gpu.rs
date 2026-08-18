use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

use fontdue::Font;

#[derive(Clone)]
pub struct GlyphInfo {
    pub width: u32,
    pub height: u32,
    pub bearing_x: i32,
    pub bearing_y: i32,
    pub bitmap: Vec<u8>,
}

static FONT_DATA: OnceLock<Vec<u8>> = OnceLock::new();

#[derive(Clone, Copy)]
pub struct GlyphUv {
    pub u0: f32,
    pub v0: f32,
    pub u1: f32,
    pub v1: f32,
    pub bearing_x: i32,
    pub bearing_y: i32,
    pub width: u32,
    pub height: u32,
}

pub struct PackedAtlas {
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub uvs: HashMap<char, GlyphUv>,
    pub cell_width: u32,
    pub cell_height: u32,
    pub font_size: f32,
}

static PACKED_ATLAS: OnceLock<RwLock<HashMap<u32, PackedAtlas>>> = OnceLock::new();

impl PackedAtlas {
    pub fn get(scale_key: u32) -> PackedAtlas {
        let cache = PACKED_ATLAS.get_or_init(|| RwLock::new(HashMap::new()));
        if let Some(atlas) = cache.read().unwrap().get(&scale_key).cloned() {
            return atlas;
        }
        let atlas = Self::build(scale_key);
        cache.write().unwrap().insert(scale_key, atlas.clone());
        atlas
    }

    fn build(scale_key: u32) -> Self {
        let scale = scale_key as f32 / 100.0;
        let font_size = (14.0 * scale).round().max(10.0);
        let font_data = font_data();
        let font = Font::from_bytes(
            font_data,
            fontdue::FontSettings {
                scale: font_size,
                ..Default::default()
            },
        )
        .expect("failed to load font");

        let (metrics, _) = font.rasterize('M', font_size);
        let cell_width = metrics.advance_width.ceil().max(1.0) as u32;
        let cell_height = (metrics.height as f32 + 4.0).ceil().max(1.0) as u32;

        let mut glyphs: Vec<(char, GlyphInfo)> = Vec::new();
        for ch in ' '..='~' {
            glyphs.push((ch, rasterize(&font, ch, font_size)));
        }

        let atlas_w = 2048u32;
        let mut x = 1u32;
        let mut y = 1u32;
        let mut row_h = 0u32;
        let mut uvs = HashMap::new();
        let mut pixels = vec![0u8; (atlas_w * atlas_w * 4) as usize];

        for (ch, glyph) in &glyphs {
            let gw = glyph.width.max(1);
            let gh = glyph.height.max(1);
            if x + gw + 1 >= atlas_w {
                x = 1;
                y += row_h + 1;
                row_h = 0;
            }
            blit_glyph(&mut pixels, atlas_w, x, y, glyph);
            uvs.insert(
                *ch,
                GlyphUv {
                    u0: x as f32 / atlas_w as f32,
                    v0: y as f32 / atlas_w as f32,
                    u1: (x + gw) as f32 / atlas_w as f32,
                    v1: (y + gh) as f32 / atlas_w as f32,
                    bearing_x: glyph.bearing_x,
                    bearing_y: glyph.bearing_y,
                    width: gw,
                    height: gh,
                },
            );
            x += gw + 1;
            row_h = row_h.max(gh);
        }

        Self {
            pixels,
            width: atlas_w,
            height: atlas_w,
            uvs,
            cell_width,
            cell_height,
            font_size,
        }
    }

    pub fn cols_for_width(&self, width: u32) -> u16 {
        (width / self.cell_width).max(1) as u16
    }

    pub fn rows_for_height(&self, height: u32) -> u16 {
        (height / self.cell_height).max(1) as u16
    }

    pub fn uv(&self, ch: char) -> Option<GlyphUv> {
        self.uvs.get(&ch).copied()
    }
}

impl Clone for PackedAtlas {
    fn clone(&self) -> Self {
        Self {
            pixels: self.pixels.clone(),
            width: self.width,
            height: self.height,
            uvs: self.uvs.clone(),
            cell_width: self.cell_width,
            cell_height: self.cell_height,
            font_size: self.font_size,
        }
    }
}

fn rasterize(font: &Font, ch: char, size: f32) -> GlyphInfo {
    let (metrics, bitmap) = font.rasterize(ch, size);
    GlyphInfo {
        width: metrics.width as u32,
        height: metrics.height as u32,
        bearing_x: metrics.xmin,
        bearing_y: metrics.ymin,
        bitmap,
    }
}

fn blit_glyph(pixels: &mut [u8], atlas_w: u32, x: u32, y: u32, glyph: &GlyphInfo) {
    for gy in 0..glyph.height {
        for gx in 0..glyph.width {
            let alpha = glyph.bitmap[(gy * glyph.width + gx) as usize];
            if alpha == 0 {
                continue;
            }
            let px = x + gx;
            let py = y + gy;
            let idx = ((py * atlas_w + px) * 4) as usize;
            if idx + 3 < pixels.len() {
                pixels[idx] = 255;
                pixels[idx + 1] = 255;
                pixels[idx + 2] = 255;
                pixels[idx + 3] = alpha;
            }
        }
    }
}

pub fn scale_key(scale: f32) -> u32 {
    (scale * 100.0).round() as u32
}

fn font_data() -> &'static [u8] {
    FONT_DATA.get_or_init(|| {
        const CANDIDATES: &[&str] = &[
            "/System/Library/Fonts/SFNSMono.ttf",
            "/Library/Fonts/SF-Mono-Regular.otf",
            "/System/Library/Fonts/Menlo.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        ];

        for path in CANDIDATES {
            if let Ok(data) = std::fs::read(path) {
                return data;
            }
        }

        panic!("no monospace font found on system");
    })
}
