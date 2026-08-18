use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<DirEntry>, String> {
    let path = resolve_under_root(root, rel)?;
    let read_dir = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let entry_path = entry.path();
        let rel_path = entry_path
            .strip_prefix(root)
            .unwrap_or(&entry_path)
            .to_string_lossy()
            .into_owned();
        entries.push(DirEntry {
            name,
            path: rel_path,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

pub fn read_file(root: &Path, rel: &str) -> Result<String, String> {
    let path = resolve_under_root(root, rel)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn write_file(root: &Path, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve_under_root(root, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .unwrap_or_else(|_| root.to_path_buf());
    let joined = if rel.is_empty() {
        root.clone()
    } else {
        root.join(rel)
    };
    let canonical = joined
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("path escapes workspace root".into());
    }
    Ok(canonical)
}
