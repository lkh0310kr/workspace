use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::files;
use crate::layout::{default_layout, extract_terminal_ids};
use crate::terminal::TerminalSession;

type TabId = u32;

#[derive(Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: TabId,
    pub title: String,
    pub layout_json: String,
    pub root_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: TabId,
}

pub struct Workspace {
    /// Root new tabs are seeded with. Each tab can then repoint its own
    /// `root_path` independently via `set_tab_root_path` — this is only
    /// the starting point for tabs created after that point.
    pub default_root_path: PathBuf,
    tabs: Vec<Tab>,
    active_tab_id: TabId,
    terminals: HashMap<u32, TerminalSession>,
    next_terminal_id: u32,
    next_tab_id: TabId,
}

struct Tab {
    id: TabId,
    title: String,
    layout_json: String,
    root_path: PathBuf,
}

impl Workspace {
    pub fn new() -> Self {
        Self::with_root(std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
    }

    /// `root`'s own validity isn't checked here — the caller (the
    /// persisted-config loader in the Tauri app) is responsible for
    /// falling back to the CWD default if the saved path no longer
    /// exists.
    pub fn with_root(root: PathBuf) -> Self {
        let mut ws = Self {
            default_root_path: root,
            tabs: Vec::new(),
            active_tab_id: 0,
            terminals: HashMap::new(),
            next_terminal_id: 0,
            next_tab_id: 0,
        };
        ws.add_tab();
        ws
    }

    /// Rebuilds a `Workspace` from a previously-persisted `WorkspaceState`
    /// (see `AppConfig`/`workspace.json` in `src/lib.rs`) instead of
    /// starting with a single fresh tab. Reuses every tab's original id
    /// (rather than reassigning fresh ones via `add_tab`) and spawns a
    /// terminal for each id actually referenced in that tab's
    /// `layout_json` — this is what makes `TerminalSession`'s tmux
    /// session-key-by-id reattach to the *same* session it had before
    /// instead of colliding with, or losing track of, another tab's.
    /// Falls back to today's fresh-tab behavior if the snapshot is empty
    /// (e.g. first launch, no `workspace.json` yet).
    pub fn from_snapshot(root: PathBuf, snapshot: WorkspaceState) -> Self {
        if snapshot.tabs.is_empty() {
            return Self::with_root(root);
        }

        let mut next_tab_id = 0;
        let mut next_terminal_id = 0;
        let mut tabs = Vec::with_capacity(snapshot.tabs.len());
        let mut terminals = HashMap::new();

        for tab in &snapshot.tabs {
            next_tab_id = next_tab_id.max(tab.id + 1);
            let tab_root = PathBuf::from(&tab.root_path);
            let tab_root = if tab_root.is_dir() {
                tab_root
            } else {
                root.clone()
            };

            for terminal_id in extract_terminal_ids(&tab.layout_json) {
                next_terminal_id = next_terminal_id.max(terminal_id + 1);
                let session = TerminalSession::new(terminal_id, 120, 40, Some(tab_root.clone()));
                session.start();
                terminals.insert(terminal_id, session);
            }

            tabs.push(Tab {
                id: tab.id,
                title: tab.title.clone(),
                layout_json: tab.layout_json.clone(),
                root_path: tab_root,
            });
        }

        let active_tab_id = if tabs.iter().any(|t| t.id == snapshot.active_tab_id) {
            snapshot.active_tab_id
        } else {
            tabs[0].id
        };

        Self {
            default_root_path: root,
            tabs,
            active_tab_id,
            terminals,
            next_terminal_id,
            next_tab_id,
        }
    }

    pub fn add_tab(&mut self) -> TabId {
        let id = self.next_tab_id;
        self.next_tab_id += 1;
        let root_path = self.default_root_path.clone();
        let terminal_id = self.spawn_terminal_in(&root_path, 120, 40);
        let layout_json = default_layout(terminal_id);
        self.tabs.push(Tab {
            id,
            title: format!("Tab {}", id + 1),
            layout_json,
            root_path,
        });
        self.active_tab_id = id;
        id
    }

    pub fn close_tab(&mut self, tab_id: TabId) -> Result<(), String> {
        if self.tabs.len() <= 1 {
            return Err("cannot close the last tab".into());
        }
        let Some(idx) = self.tabs.iter().position(|t| t.id == tab_id) else {
            return Err("tab not found".into());
        };

        let tab = self.tabs.remove(idx);
        self.release_terminals_only_in_tab(&tab.layout_json);

        if self.active_tab_id == tab_id {
            let next = idx.min(self.tabs.len().saturating_sub(1));
            self.active_tab_id = self.tabs[next].id;
        }

        Ok(())
    }

    pub fn select_tab(&mut self, tab_id: TabId) {
        if self.tabs.iter().any(|t| t.id == tab_id) {
            self.active_tab_id = tab_id;
        }
    }

    pub fn set_tab_layout(&mut self, tab_id: TabId, layout_json: String) {
        let Some(tab) = self.tabs.iter_mut().find(|t| t.id == tab_id) else {
            return;
        };

        let old_ids: HashSet<u32> = extract_terminal_ids(&tab.layout_json).into_iter().collect();
        tab.layout_json = layout_json.clone();
        let new_ids: HashSet<u32> = extract_terminal_ids(&layout_json).into_iter().collect();

        for id in old_ids.difference(&new_ids) {
            if !self.is_terminal_referenced(*id) {
                self.terminals.remove(id);
            }
        }
    }

    pub fn spawn_terminal(&mut self, cols: u16, rows: u16) -> u32 {
        let root = self
            .tabs
            .iter()
            .find(|t| t.id == self.active_tab_id)
            .map(|t| t.root_path.clone())
            .unwrap_or_else(|| self.default_root_path.clone());
        self.spawn_terminal_in(&root, cols, rows)
    }

    fn spawn_terminal_in(&mut self, root: &Path, cols: u16, rows: u16) -> u32 {
        let id = self.next_terminal_id;
        self.next_terminal_id += 1;
        let session = TerminalSession::new(id, cols, rows, Some(root.to_path_buf()));
        session.start();
        self.terminals.insert(id, session);
        id
    }

    /// Existing terminals keep their own cwd — only ones spawned after
    /// this takes effect. Rejects anything that isn't an existing
    /// directory rather than silently falling back, so a typo'd Settings
    /// path doesn't quietly leave you where you were. Scoped to a single
    /// tab — other tabs keep whatever root they already had.
    pub fn set_tab_root_path(&mut self, tab_id: TabId, path: PathBuf) -> Result<(), String> {
        if !path.is_dir() {
            return Err(format!("not a directory: {}", path.display()));
        }
        let Some(tab) = self.tabs.iter_mut().find(|t| t.id == tab_id) else {
            return Err("tab not found".into());
        };
        tab.root_path = path;
        Ok(())
    }

    pub fn tab_root_path(&self, tab_id: TabId) -> Option<PathBuf> {
        self.tabs
            .iter()
            .find(|t| t.id == tab_id)
            .map(|t| t.root_path.clone())
    }

    pub fn terminal_write(&self, id: u32, data: &[u8]) {
        if let Some(session) = self.terminals.get(&id) {
            session.write(data);
        }
    }

    pub fn terminal_resize(&mut self, id: u32, cols: u16, rows: u16) {
        if let Some(session) = self.terminals.get_mut(&id) {
            session.resize(cols, rows);
        }
    }

    pub fn poll_all_terminals(&self) -> Vec<(u32, Vec<u8>)> {
        let mut outputs = Vec::new();
        for (id, session) in &self.terminals {
            let chunks = session.drain_chunks();
            for chunk in chunks {
                if !chunk.is_empty() {
                    outputs.push((*id, chunk));
                }
            }
        }
        outputs
    }

    pub fn state(&self) -> WorkspaceState {
        WorkspaceState {
            tabs: self
                .tabs
                .iter()
                .map(|t| TabInfo {
                    id: t.id,
                    title: t.title.clone(),
                    layout_json: t.layout_json.clone(),
                    root_path: t.root_path.to_string_lossy().into_owned(),
                })
                .collect(),
            active_tab_id: self.active_tab_id,
        }
    }

    pub fn list_dir(&self, tab_id: TabId, rel: &str) -> Result<Vec<files::DirEntry>, String> {
        files::list_dir(&self.tab_root(tab_id)?, rel)
    }

    pub fn read_file(&self, tab_id: TabId, rel: &str) -> Result<String, String> {
        files::read_file(&self.tab_root(tab_id)?, rel)
    }

    pub fn write_file(&self, tab_id: TabId, rel: &str, content: &str) -> Result<(), String> {
        files::write_file(&self.tab_root(tab_id)?, rel, content)
    }

    fn tab_root(&self, tab_id: TabId) -> Result<PathBuf, String> {
        self.tabs
            .iter()
            .find(|t| t.id == tab_id)
            .map(|t| t.root_path.clone())
            .ok_or_else(|| "tab not found".into())
    }

    fn is_terminal_referenced(&self, terminal_id: u32) -> bool {
        self.tabs
            .iter()
            .any(|t| extract_terminal_ids(&t.layout_json).contains(&terminal_id))
    }

    fn release_terminals_only_in_tab(&mut self, layout_json: &str) {
        for id in extract_terminal_ids(layout_json) {
            if !self.is_terminal_referenced(id) {
                self.terminals.remove(&id);
            }
        }
    }
}
