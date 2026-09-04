//! Stable runtime snapshots for headless tools and AI agents.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{Context, Result};

use crate::RuntimeState;

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub fn runtime_dump_json(state: &RuntimeState) -> Result<String> {
    let mut json = serde_json::to_string_pretty(state)?;
    json.push('\n');
    Ok(json)
}

pub fn write_runtime_dump(path: impl AsRef<Path>, state: &RuntimeState) -> Result<()> {
    let path = path.as_ref();
    let temp_path = temporary_path(path);
    fs::write(&temp_path, runtime_dump_json(state)?)
        .with_context(|| format!("failed to write runtime dump '{}'", temp_path.display()))?;

    if let Err(first_error) = fs::rename(&temp_path, path) {
        // Windows does not replace an existing destination with rename().
        let retry = path.exists() && fs::remove_file(path).is_ok();
        if !retry || fs::rename(&temp_path, path).is_err() {
            let _ = fs::remove_file(&temp_path);
            return Err(first_error)
                .with_context(|| format!("failed to publish runtime dump '{}'", path.display()));
        }
    }
    Ok(())
}

fn temporary_path(path: &Path) -> PathBuf {
    let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("runtime.json");
    path.with_file_name(format!(
        ".{file_name}.tmp-{}-{sequence}",
        std::process::id()
    ))
}
