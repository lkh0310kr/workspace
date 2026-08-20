use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize, Debug)]
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

/// `canonicalize()` requires the full path to already exist, which is
/// fine for `list_dir`/`read_file` but wrong for `write_file` creating a
/// brand-new file: canonicalizing `root.join("untitled.md")` before that
/// file exists always fails with NotFound, so every "create a new file"
/// call was rejected outright before ever reaching `fs::write` (verified
/// directly — `PathBuf::canonicalize()` on a nonexistent path errors,
/// not assumed). Fixed by walking up to whichever prefix of the joined
/// path *does* already exist, canonicalizing and root-checking just that
/// prefix (same escape-prevention guarantee `starts_with` gave before,
/// just checked against an existing ancestor instead of the full leaf),
/// then re-appending the not-yet-existing remainder verbatim.
fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    if rel.is_empty() {
        return Ok(root);
    }
    let joined = root.join(rel);

    let mut existing: &Path = &joined;
    let mut remainder: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        let Some(name) = existing.file_name() else {
            return Err("invalid path".into());
        };
        remainder.push(name.to_os_string());
        let Some(parent) = existing.parent() else {
            return Err("invalid path".into());
        };
        existing = parent;
    }

    let mut canonical = existing.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("path escapes workspace root".into());
    }
    for part in remainder.into_iter().rev() {
        canonical.push(part);
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("workspace-core-files-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_file_creates_a_brand_new_file() {
        let root = temp_root();
        write_file(&root, "untitled.md", "hello").expect("creating a new file should succeed");
        assert_eq!(read_file(&root, "untitled.md").unwrap(), "hello");
    }

    #[test]
    fn write_file_creates_nested_new_directories_and_file() {
        let root = temp_root();
        write_file(&root, "sub/deeper/note.md", "nested").expect("nested new file should succeed");
        assert_eq!(read_file(&root, "sub/deeper/note.md").unwrap(), "nested");
    }

    #[test]
    fn write_file_still_overwrites_an_existing_file() {
        let root = temp_root();
        write_file(&root, "note.md", "first").unwrap();
        write_file(&root, "note.md", "second").unwrap();
        assert_eq!(read_file(&root, "note.md").unwrap(), "second");
    }

    #[test]
    fn write_file_rejects_escaping_the_root() {
        let root = temp_root();
        let err = write_file(&root, "../../etc/evil.md", "nope").unwrap_err();
        assert!(
            err.contains("escapes"),
            "expected an escape error, got: {err}"
        );
    }

    #[test]
    fn list_dir_sees_a_just_created_file() {
        let root = temp_root();
        write_file(&root, "a.md", "").unwrap();
        let entries = list_dir(&root, "").unwrap();
        assert!(
            entries.iter().any(|e| e.name == "a.md"),
            "expected a.md in {:?}",
            entries
        );
    }
}
