//! Archived GPU terminal renderer. Not used by the default xterm.js shell.
pub mod find;
pub mod renderer;
pub mod screen;
pub mod theme;
pub mod url;

pub use renderer::{GpuContext, GpuTerminalTexture};
