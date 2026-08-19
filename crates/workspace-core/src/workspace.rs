use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::Serialize;

use crate::files;
use crate::layout::{default_layout, extract_terminal_ids};
use crate::terminal::TerminalSession;

type TabId = u32;

#[derive(Clone, Serialize)]
pub struct TabInfo {
    pub id: TabId,
    pub title: String,
    pub layout_json: String,
}

#[derive(Clone, Serialize)]
pub struct WorkspaceState {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: TabId,
    pub root_path: String,
}

pub struct Workspace {
    pub root_path: PathBuf,
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
            root_path: root,
            tabs: Vec::new(),
            active_tab_id: 0,
            terminals: HashMap::new(),
            next_terminal_id: 0,
            next_tab_id: 0,
        };
        ws.add_tab();
        ws
    }

    pub fn add_tab(&mut self) -> TabId {
        let id = self.next_tab_id;
        self.next_tab_id += 1;
        let terminal_id = self.spawn_terminal(120, 40);
        let layout_json = default_layout(terminal_id);
        self.tabs.push(Tab {
            id,
            title: format!("Workspace {}", id + 1),
            layout_json,
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
        let id = self.next_terminal_id;
        self.next_terminal_id += 1;
        let session = TerminalSession::new(id, cols, rows, Some(self.root_path.clone()));
        session.start();
        self.terminals.insert(id, session);
        id
    }

    /// Existing terminals keep their own cwd — only ones spawned after
    /// this takes effect. Rejects anything that isn't an existing
    /// directory rather than silently falling back, so a typo'd Settings
    /// path doesn't quietly leave you where you were.
    pub fn set_root_path(&mut self, path: PathBuf) -> Result<(), String> {
        if !path.is_dir() {
            return Err(format!("not a directory: {}", path.display()));
        }
        self.root_path = path;
        Ok(())
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
                })
                .collect(),
            active_tab_id: self.active_tab_id,
            root_path: self.root_path.to_string_lossy().into_owned(),
        }
    }

    pub fn list_dir(&self, rel: &str) -> Result<Vec<files::DirEntry>, String> {
        files::list_dir(&self.root_path, rel)
    }

    pub fn read_file(&self, rel: &str) -> Result<String, String> {
        files::read_file(&self.root_path, rel)
    }

    pub fn write_file(&self, rel: &str, content: &str) -> Result<(), String> {
        files::write_file(&self.root_path, rel, content)
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
