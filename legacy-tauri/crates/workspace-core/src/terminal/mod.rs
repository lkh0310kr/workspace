mod pty;
mod session;

pub use session::TerminalSession;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaneType {
    Code,
    Markdown,
    Terminal,
    Browser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneConfig {
    pub id: u32,
    pub pane_type: PaneType,
    pub terminal_id: Option<u32>,
}
