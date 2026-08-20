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

pub fn create_dir(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve_under_root(root, rel)?;
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Deletes a file or directory (recursively) at `rel`. `rel` must
/// already exist — `resolve_under_root` only tolerates a nonexistent
/// *leaf* for creation-style callers (`write_file`), and here that
/// would just mean there's nothing to delete, so this checks existence
/// explicitly up front instead of forwarding a confusing OS error.
pub fn delete_path(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve_under_root(root, rel)?;
    let metadata = fs::symlink_metadata(&path).map_err(|_| "not found".to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

/// Renames/moves `from_rel` to `to_rel`, both resolved under `root`
/// (`to_rel` need not exist yet — same not-yet-existing-leaf handling
/// `write_file` relies on). Creates `to`'s parent directory if moving
/// into a not-yet-existing subfolder, same as `write_file` does.
pub fn rename_path(root: &Path, from_rel: &str, to_rel: &str) -> Result<(), String> {
    let from = resolve_under_root(root, from_rel)?;
    let to = resolve_under_root(root, to_rel)?;
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())
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

    // `cargo test` runs tests as threads within one process, not one
    // process each — keying this by `std::process::id()` alone (as an
    // earlier version of this did) meant every test in this file shared
    // the exact same directory and raced each other's `remove_dir_all`/
    // writes. An atomic counter guarantees each call gets its own.
    fn temp_root() -> PathBuf {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "workspace-core-files-test-{}-{n}",
            std::process::id()
        ));
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

    #[test]
    fn create_dir_makes_a_new_directory() {
        let root = temp_root();
        create_dir(&root, "sub/deeper").unwrap();
        let entries = list_dir(&root, "sub").unwrap();
        assert!(entries.iter().any(|e| e.name == "deeper" && e.is_dir));
    }

    #[test]
    fn delete_path_removes_a_file() {
        let root = temp_root();
        write_file(&root, "a.md", "").unwrap();
        delete_path(&root, "a.md").unwrap();
        assert!(read_file(&root, "a.md").is_err());
    }

    #[test]
    fn delete_path_removes_a_directory_recursively() {
        let root = temp_root();
        write_file(&root, "sub/a.md", "").unwrap();
        delete_path(&root, "sub").unwrap();
        assert!(list_dir(&root, "sub").is_err());
    }

    #[test]
    fn rename_path_moves_a_file() {
        let root = temp_root();
        write_file(&root, "old.md", "hi").unwrap();
        rename_path(&root, "old.md", "new.md").unwrap();
        assert_eq!(read_file(&root, "new.md").unwrap(), "hi");
        assert!(read_file(&root, "old.md").is_err());
    }

    #[test]
    fn rename_path_rejects_escaping_the_root() {
        let root = temp_root();
        write_file(&root, "old.md", "hi").unwrap();
        let err = rename_path(&root, "old.md", "../../etc/evil.md").unwrap_err();
        assert!(err.contains("escapes"), "expected an escape error, got: {err}");
    }
}
