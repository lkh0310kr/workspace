use regex::Regex;

use theme::Rgb8;

pub struct UrlDetector {
    regex: Regex,
}

#[derive(Clone)]
pub struct UrlRange {
    pub col_start: usize,
    pub col_end: usize,
    pub url: String,
}

impl UrlDetector {
    pub fn new() -> Self {
        Self {
            regex: Regex::new(r"https?://[^\s\]]+").expect("invalid url regex"),
        }
    }

    pub fn ranges_in_line(&self, line: &str) -> Vec<UrlRange> {
        self.regex
            .find_iter(line)
            .map(|m| UrlRange {
                col_start: m.start(),
                col_end: m.end(),
                url: m.as_str().to_string(),
            })
            .collect()
    }

    pub fn find_at(&self, line: &str, col: usize) -> Option<String> {
        for m in self.regex.find_iter(line) {
            if col >= m.start() && col < m.end() {
                return Some(m.as_str().to_string());
            }
        }
        None
    }

    pub fn open(url: &str) {
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg(url).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open").arg(url).spawn();
        }
    }

    pub fn url_color(&self, theme: &theme::Theme) -> Rgb8 {
        theme.url
    }
}
