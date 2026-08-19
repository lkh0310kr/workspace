use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};
use browser_host::BrowserHost;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use workspace_core::Workspace;

mod browser_host;
mod cef_host;

pub struct AppState {
    pub workspace: Mutex<Workspace>,
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
fn spawn_terminal(
    state: State<'_, Arc<AppState>>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    Ok(state.workspace.lock().spawn_terminal(cols, rows))
}

#[tauri::command]
fn add_tab(state: State<'_, Arc<AppState>>, app: AppHandle) -> Result<u32, String> {
    let tab_id = state.workspace.lock().add_tab();
    let _ = app.emit("workspace-updated", state.workspace.lock().state());
    Ok(tab_id)
}

#[tauri::command]
fn close_tab(state: State<'_, Arc<AppState>>, app: AppHandle, tab_id: u32) -> Result<(), String> {
    state.workspace.lock().close_tab(tab_id)?;
    let _ = app.emit("workspace-updated", state.workspace.lock().state());
    Ok(())
}

#[tauri::command]
fn select_tab(state: State<'_, Arc<AppState>>, app: AppHandle, tab_id: u32) -> Result<(), String> {
    state.workspace.lock().select_tab(tab_id);
    let _ = app.emit("workspace-updated", state.workspace.lock().state());
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
    let _ = app.emit("workspace-updated", state.workspace.lock().state());
    Ok(())
}

#[tauri::command]
fn list_dir(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<Vec<workspace_core::files::DirEntry>, String> {
    state.workspace.lock().list_dir(&path)
}

#[tauri::command]
fn read_file(state: State<'_, Arc<AppState>>, path: String) -> Result<String, String> {
    state.workspace.lock().read_file(&path)
}

#[tauri::command]
fn write_file(
    state: State<'_, Arc<AppState>>,
    path: String,
    content: String,
) -> Result<(), String> {
    state.workspace.lock().write_file(&path, &content)
}

fn spawn_pty_poll(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(8));
        let outputs = state.workspace.lock().poll_all_terminals();
        for (id, chunk) in outputs {
            let payload = PtyOutputPayload {
                id,
                data_b64: STANDARD.encode(&chunk),
            };
            let _ = app.emit("pty-output", payload);
        }
    });
}

fn spawn_file_watcher(app: AppHandle, root: PathBuf) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            notify::Config::default(),
        )
        .expect("failed to create file watcher");

        let _ = watcher.watch(&root, RecursiveMode::Recursive);

        while let Ok(Ok(event)) = rx.recv() {
            if matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                let _ = app.emit("file-changed", ());
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let workspace = Workspace::new();
    let root = workspace.root_path.clone();

    let state = Arc::new(AppState {
        workspace: Mutex::new(workspace),
    });

    let browser_host = Mutex::new(BrowserHost::new());

    let poll_state = Arc::clone(&state);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .manage(browser_host)
        .setup(move |app| {
            let handle = app.handle().clone();
            browser_host::cleanup_browser_webviews(&handle);
            browser_host::attach_window_events(&handle);
            spawn_pty_poll(handle.clone(), poll_state);
            spawn_file_watcher(handle.clone(), root);
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
            list_dir,
            read_file,
            write_file,
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
