use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};
use browser_host::BrowserHost;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use workspace_core::Workspace;

mod browser_host;
mod cef_host;

pub struct AppState {
    pub workspace: Mutex<Workspace>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    watch_tx: Mutex<Option<WatchSender>>,
}

#[derive(Default, Serialize, Deserialize)]
struct AppConfig {
    root_path: Option<String>,
}

// Not going through `app.path().app_config_dir()`: that needs a running
// `AppHandle`, only available inside `.setup()` — by which point
// `Workspace::new()` (and the first tab/terminal it spawns) has already
// run with whatever default root_path we gave it. Resolving this by hand
// lets the persisted path be loaded *before* constructing the Workspace
// at all, so the very first terminal already opens in the right place
// instead of needing a second, later correction. Same macOS-only
// resolution convention `cef_host.rs`'s `dirs_cache_path()` already uses.
fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("workspace-app")
            .join("config.json"),
    )
}

fn load_config() -> AppConfig {
    config_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path().ok_or("no HOME set")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let contents = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

/// Sibling of `config_path()` — persists tabs/layout/per-tab root paths
/// (not just the single default root `AppConfig` holds) so a relaunch (an
/// app update/rebuild included) restores the same tabs with the same
/// terminal ids, which is what lets each terminal's tmux session (see
/// `TerminalSession::new`) reattach to its own previous session instead
/// of starting fresh.
fn workspace_snapshot_path() -> Option<PathBuf> {
    config_path()?
        .parent()
        .map(|dir| dir.join("workspace.json"))
}

fn load_workspace_snapshot() -> Option<workspace_core::WorkspaceState> {
    let path = workspace_snapshot_path()?;
    let contents = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn save_workspace_snapshot(snapshot: &workspace_core::WorkspaceState) {
    let Some(path) = workspace_snapshot_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string_pretty(snapshot) {
        let _ = std::fs::write(path, contents);
    }
}

/// Registers every tab's root_path with the asset-protocol scope so
/// `convertFileSrc` can load local images referenced from Markdown —
/// the scope defaults to empty (`tauri.conf.json`'s `assetProtocol.scope`
/// is `[]`) since tab roots are arbitrary, user-chosen directories picked
/// at runtime, not something knowable at build time. `allow_directory` is
/// purely additive and safe to call repeatedly with the same path, so
/// this is just re-run on every workspace-state change rather than
/// tracked against which roots are already scoped.
fn allow_asset_scope(app: &AppHandle, state: &workspace_core::WorkspaceState) {
    let scope = app.asset_protocol_scope();
    for tab in &state.tabs {
        let _ = scope.allow_directory(&tab.root_path, true);
    }
}

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    id: u32,
    data_b64: String,
}

#[tauri::command]
fn get_workspace_state(state: State<'_, Arc<AppState>>) -> workspace_core::WorkspaceState {
    state.workspace.lock().state()
}

#[tauri::command]
fn pty_write(state: State<'_, Arc<AppState>>, id: u32, data_b64: String) -> Result<(), String> {
    let bytes = STANDARD.decode(data_b64).map_err(|e| e.to_string())?;
    state.workspace.lock().terminal_write(id, &bytes);
    Ok(())
}

#[tauri::command]
fn pty_resize(
    state: State<'_, Arc<AppState>>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.workspace.lock().terminal_resize(id, cols, rows);
    Ok(())
}

#[tauri::command]
fn spawn_terminal(state: State<'_, Arc<AppState>>, cols: u16, rows: u16) -> Result<u32, String> {
    Ok(state.workspace.lock().spawn_terminal(cols, rows))
}

#[tauri::command]
fn add_tab(state: State<'_, Arc<AppState>>, app: AppHandle) -> Result<u32, String> {
    let tab_id = state.workspace.lock().add_tab();
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(tab_id)
}

#[tauri::command]
fn close_tab(state: State<'_, Arc<AppState>>, app: AppHandle, tab_id: u32) -> Result<(), String> {
    state.workspace.lock().close_tab(tab_id)?;
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(())
}

#[tauri::command]
fn select_tab(state: State<'_, Arc<AppState>>, app: AppHandle, tab_id: u32) -> Result<(), String> {
    state.workspace.lock().select_tab(tab_id);
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(())
}

#[tauri::command]
fn set_tab_layout(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    tab_id: u32,
    layout_json: String,
) -> Result<(), String> {
    state.workspace.lock().set_tab_layout(tab_id, layout_json);
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    Ok(())
}

#[tauri::command]
fn set_tab_root_path(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    tab_id: u32,
    path: String,
) -> Result<workspace_core::WorkspaceState, String> {
    let root = PathBuf::from(&path);
    {
        let mut ws = state.workspace.lock();
        ws.set_tab_root_path(tab_id, root.clone())?;
        // Newly created tabs are seeded from whatever root was last set —
        // and it's what gets persisted below, so the app reopens wherever
        // you last pointed it.
        ws.default_root_path = root.clone();
    }
    save_config(&AppConfig {
        root_path: Some(path),
    })?;

    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(new_state)
}

#[tauri::command]
fn list_dir(
    state: State<'_, Arc<AppState>>,
    tab_id: u32,
    path: String,
) -> Result<Vec<workspace_core::files::DirEntry>, String> {
    state.workspace.lock().list_dir(tab_id, &path)
}

#[tauri::command]
fn read_file(state: State<'_, Arc<AppState>>, tab_id: u32, path: String) -> Result<String, String> {
    state.workspace.lock().read_file(tab_id, &path)
}

#[tauri::command]
fn write_file(
    state: State<'_, Arc<AppState>>,
    tab_id: u32,
    path: String,
    content: String,
) -> Result<(), String> {
    state.workspace.lock().write_file(tab_id, &path, &content)
}

#[tauri::command]
fn create_dir(state: State<'_, Arc<AppState>>, tab_id: u32, path: String) -> Result<(), String> {
    state.workspace.lock().create_dir(tab_id, &path)
}

#[tauri::command]
fn delete_path(state: State<'_, Arc<AppState>>, tab_id: u32, path: String) -> Result<(), String> {
    state.workspace.lock().delete_path(tab_id, &path)
}

#[tauri::command]
fn rename_path(
    state: State<'_, Arc<AppState>>,
    tab_id: u32,
    from: String,
    to: String,
) -> Result<(), String> {
    state.workspace.lock().rename_path(tab_id, &from, &to)
}

fn spawn_pty_poll(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(8));
            let outputs = state.workspace.lock().poll_all_terminals();
            for (id, chunk) in outputs {
                let payload = PtyOutputPayload {
                    id,
                    data_b64: STANDARD.encode(&chunk),
                };
                let _ = app.emit("pty-output", payload);
            }
        }
    });
}

type WatchSender = std::sync::mpsc::Sender<notify::Result<notify::Event>>;

/// Runs for the app's whole lifetime, relaying whichever `RecommendedWatcher`
/// is currently installed in `AppState.watcher` — kept separate from the
/// watcher itself so `set_workspace_root` can swap the watcher (stop
/// watching the old root, start watching the new one) without needing to
/// also restart this relay.
fn spawn_watch_relay(app: AppHandle) -> WatchSender {
    let (tx, rx): (WatchSender, _) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        while let Ok(Ok(event)) = rx.recv() {
            if matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                let _ = app.emit("file-changed", ());
            }
        }
    });
    tx
}

/// Dropping the previous `RecommendedWatcher` (by assigning over it in
/// `AppState.watcher`) stops it from watching its old root.
fn watch_root(root: &std::path::Path, tx: WatchSender) -> Option<RecommendedWatcher> {
    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        notify::Config::default(),
    )
    .ok()?;
    let _ = watcher.watch(root, RecursiveMode::Recursive);
    Some(watcher)
}

/// Each tab can have its own root_path now, so the single filesystem
/// watcher (and the `file-changed` events it drives, e.g. for TreeView
/// refresh) always follows whichever tab is currently active rather than
/// a single app-wide root.
fn rewatch_active(state: &Arc<AppState>) {
    let active_id = state.workspace.lock().state().active_tab_id;
    let Some(root) = state.workspace.lock().tab_root_path(active_id) else {
        return;
    };
    if let Some(tx) = state.watch_tx.lock().clone() {
        *state.watcher.lock() = watch_root(&root, tx);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config();
    let default_root = match config.root_path.as_deref().map(PathBuf::from) {
        Some(path) if path.is_dir() => path,
        _ => std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    };
    // Restoring from `workspace.json` (tabs, layout, per-tab root paths,
    // and — critically — each tab's original terminal ids) is what makes
    // a relaunch (app update/rebuild included) pick back up instead of
    // starting over with one fresh tab; see `Workspace::from_snapshot`
    // and `TerminalSession::new`'s tmux session-key-by-id reattachment.
    let workspace = match load_workspace_snapshot() {
        Some(snapshot) => Workspace::from_snapshot(default_root.clone(), snapshot),
        None => Workspace::with_root(default_root),
    };

    let state = Arc::new(AppState {
        workspace: Mutex::new(workspace),
        watcher: Mutex::new(None),
        watch_tx: Mutex::new(None),
    });

    let browser_host = Mutex::new(BrowserHost::new());

    let poll_state = Arc::clone(&state);
    let setup_state = Arc::clone(&state);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .manage(browser_host)
        .setup(move |app| {
            let handle = app.handle().clone();
            browser_host::cleanup_browser_webviews(&handle);
            browser_host::attach_window_events(&handle);
            spawn_pty_poll(handle.clone(), poll_state);

            let tx = spawn_watch_relay(handle.clone());
            *setup_state.watch_tx.lock() = Some(tx);
            rewatch_active(&setup_state);
            // First launch (no workspace.json yet) would otherwise never
            // persist anything until the user creates/closes/renames a
            // tab — meaning a never-touched default single tab's
            // terminal id (and thus its tmux session) would be lost on
            // the very next relaunch. Save the just-constructed state
            // immediately so that can't happen.
            let initial_state = setup_state.workspace.lock().state();
            save_workspace_snapshot(&initial_state);
            allow_asset_scope(&handle, &initial_state);

            let _ = handle.emit("app-ready", ());
            cef_host::set_app_handle(handle.clone());
            cef_host::initialize_cef();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_workspace_state,
            pty_write,
            pty_resize,
            spawn_terminal,
            add_tab,
            close_tab,
            select_tab,
            set_tab_layout,
            set_tab_root_path,
            list_dir,
            read_file,
            write_file,
            create_dir,
            delete_path,
            rename_path,
            browser_host::browser_report_frame,
            browser_host::browser_navigate,
            browser_host::browser_back,
            browser_host::browser_forward,
            browser_host::browser_reload,
            browser_host::browser_toggle_devtools,
            browser_host::browser_hide_all,
            browser_host::browser_detach,
            browser_host::browser_cleanup_all,
            cef_host::cef_report_frame,
            cef_host::cef_navigate,
            cef_host::cef_back,
            cef_host::cef_forward,
            cef_host::cef_reload,
            cef_host::cef_toggle_devtools,
            cef_host::cef_close_pane,
            cef_host::cef_hide_pane,
            cef_host::cef_hide_all,
            cef_host::cef_cleanup_all,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                cef_host::shutdown();
            }
        });
}

/// Called at the very top of `main`, before any Tauri setup. See
/// `cef_host` module docs for why this must happen first.
pub fn cef_dispatch_subprocess() -> bool {
    cef_host::dispatch_subprocess_and_check_is_browser_process()
}
