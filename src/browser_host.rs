use std::collections::HashMap;

use parking_lot::Mutex;
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WindowEvent};
use url::Url;

/// macOS: child webviews (`add_child`) are positioned relative to the
/// window's full content view, but this (main) webview's own DOM coordinates
/// start below the title bar — so a child placed at the DOM's reported y
/// renders one title-bar-height too high, covering whatever sits at the top
/// of the pane (e.g. the browser toolbar). Measured empirically for the
/// default titled/resizable window in tauri.conf.json; revisit if the
/// window's title bar style changes.
const TITLE_BAR_INSET: f64 = 32.0;

/// Runs before any page script on every navigation (WKWebView `WKUserScript`,
/// via wry's initialization-script hook — unlike `on_web_resource_request`
/// this *does* apply to external URLs, not just our own bundled content).
/// `navigator.webdriver` defaults to `true` on an embedded WKWebView the way
/// wry configures it, which is a real bot-detection tell distinct from (and
/// in addition to) the UA-spoofing mismatch we already reverted — see the
/// Orca reference project's `anti-detection.ts` for the same fix applied to
/// their Chromium webviews. Deliberately not faking plugins/`window.chrome`
/// here: this webview's UA already honestly identifies it as WebKit/Safari,
/// and adding Chrome-shaped fingerprints on top of a Safari UA would be a
/// second, self-inflicted mismatch of the same kind we just removed.
const ANTI_AUTOMATION_SCRIPT: &str =
    "Object.defineProperty(navigator, 'webdriver', { get: () => false });";

/// Width (logical px) reserved on the right of a browser pane's webview for
/// WKWebView's own inline inspector when devtools is toggled open. See
/// `browser_toggle_devtools`.
const DEVTOOLS_RESERVED_WIDTH: f64 = 380.0;

#[derive(Clone)]
struct Frame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone)]
struct BrowserPane {
    url: String,
    content: Frame,
    visible: bool,
}

pub struct BrowserHost {
    panes: HashMap<String, BrowserPane>,
    applied_frames: HashMap<String, Frame>,
    devtools_open: HashMap<String, bool>,
}

impl BrowserHost {
    pub fn new() -> Self {
        Self {
            panes: HashMap::new(),
            applied_frames: HashMap::new(),
            devtools_open: HashMap::new(),
        }
    }

    fn content_frame(content: &Frame) -> Option<Frame> {
        if content.width < 1.0 || content.height < 1.0 {
            return None;
        }
        Some(content.clone())
    }
}

fn webview_label(pane_id: &str) -> String {
    let sanitized: String = pane_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | ':' | '_' | '/') {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("browser-{sanitized}")
}

fn parse_url(raw: &str) -> Result<Url, String> {
    raw.parse().map_err(|e: url::ParseError| e.to_string())
}

fn main_window(app: &AppHandle) -> Result<tauri::Window, String> {
    app.get_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

pub fn cleanup_browser_webviews(app: &AppHandle) {
    for (label, webview) in app.webviews() {
        if label.starts_with("browser-") {
            let _ = webview.close();
        }
    }
}

// All browser panes share one persistent session: `WebviewBuilder::new(...)` here
// never calls `.incognito(true)` or `.data_store_identifier(...)`, so every
// `browser-{pane_id}` webview uses wry's default `WKWebsiteDataStore::defaultDataStore`
// on macOS — cookies, localStorage, and IndexedDB are already shared across every
// browser pane, like tabs in one browser profile. Do not add per-pane isolation here
// without a deliberate reason.
fn create_child_webview(
    app: &AppHandle,
    pane_id: &str,
    pane: &BrowserPane,
    position: LogicalPosition<f64>,
    size: LogicalSize<f64>,
) -> Result<(), String> {
    let label = webview_label(pane_id);
    let window = main_window(app)?;
    let parsed = parse_url(&pane.url)?;
    let load_app = app.clone();
    let load_pane_id = pane_id.to_string();
    // Deliberately not overriding the user agent: WKWebView's real UA already
    // identifies it as WebKit/Safari-based, which is truthful. Spoofing a
    // Chrome UA string without the Client Hints headers/`navigator.userAgentData`
    // a real Chrome would send is an inconsistency bot-detection systems (e.g.
    // Google's) actively look for — it made things worse, not better, and is
    // suspected to have contributed to a CAPTCHA challenge during testing.
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed))
        .initialization_script(ANTI_AUTOMATION_SCRIPT)
        .on_page_load(move |_webview, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            let _ = load_app.emit(
                "browser-loading",
                serde_json::json!({ "paneId": load_pane_id, "loading": loading }),
            );
        });
    window
        .add_child(builder, position, size)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_pane(
    app: &AppHandle,
    host: &mut BrowserHost,
    pane_id: &str,
    pane: &BrowserPane,
) -> Result<(), String> {
    let label = webview_label(pane_id);

    if !pane.visible {
        if let Some(webview) = app.get_webview(&label) {
            webview.hide().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    // A degenerate (sub-1px) size is almost always a transient mid-reflow
    // measurement during a split/resize, not a real "this pane is gone" signal
    // — real invisibility is already handled by the `!pane.visible` check
    // above. Hiding here causes a WKWebView hide/show cycle that can leave
    // the view painted black until something forces a repaint (e.g. the user
    // re-navigating), so just skip this update and wait for the next
    // (settled) frame report instead.
    let Some(content) = BrowserHost::content_frame(&pane.content) else {
        return Ok(());
    };

    let width = if host.devtools_open.get(pane_id).copied().unwrap_or(false) {
        (content.width - DEVTOOLS_RESERVED_WIDTH).max(200.0)
    } else {
        content.width
    };
    let position = LogicalPosition::new(content.x, content.y);
    let size = LogicalSize::new(width, content.height);
    let window = main_window(app)?;
    let scale = window.scale_factor().unwrap_or(1.0);

    if let Some(webview) = app.get_webview(&label) {
        webview
            .set_position(position)
            .map_err(|e| e.to_string())?;
        webview.set_size(size).map_err(|e| e.to_string())?;

        let actual_y = webview
            .position()
            .ok()
            .map(|p| p.y as f64 / scale)
            .unwrap_or(-1.0);

        if (actual_y - content.y).abs() > 1.0 {
            // Platform failed to honor the vertical reposition; only now
            // fall back to destroy+recreate (loses page state).
            webview.close().map_err(|e| e.to_string())?;
            host.applied_frames.remove(pane_id);
        } else {
            webview.show().map_err(|e| e.to_string())?;
            host.applied_frames.insert(pane_id.to_string(), content);
            return Ok(());
        }
    }

    create_child_webview(app, pane_id, pane, position, size)?;
    host.applied_frames.insert(pane_id.to_string(), content);
    Ok(())
}

fn sync_all_visible(app: &AppHandle, host: &mut BrowserHost) -> Result<(), String> {
    let pane_ids: Vec<String> = host.panes.keys().cloned().collect();
    for pane_id in pane_ids {
        if let Some(pane) = host.panes.get(&pane_id).cloned() {
            apply_pane(app, host, &pane_id, &pane)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_report_frame(
    app: AppHandle,
    host: State<'_, Mutex<BrowserHost>>,
    pane_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
) -> Result<(), String> {
    // Child webviews are positioned relative to the window's content view,
    // which on macOS is taller than this (the main) webview's own viewport
    // by the title bar height — `add_child` coordinates and this webview's
    // DOM coordinates don't share an origin. Compensate with the measured
    // constant inset (see TITLE_BAR_INSET).
    let content = Frame {
        x,
        y: y + TITLE_BAR_INSET,
        width,
        height,
    };

    let label = webview_label(&pane_id);
    let should_navigate = {
        let guard = host.lock();
        guard
            .panes
            .get(&pane_id)
            .is_none_or(|stored| stored.url != url)
    };

    {
        let mut guard = host.lock();
        guard.panes.insert(
            pane_id.clone(),
            BrowserPane {
                url: url.clone(),
                content,
                visible,
            },
        );
    }

    let pane = host.lock().panes.get(&pane_id).cloned();
    let Some(pane) = pane else {
        return Ok(());
    };

    {
        let mut guard = host.lock();
        apply_pane(&app, &mut guard, &pane_id, &pane)?;
    }

    if should_navigate {
        if let Some(webview) = app.get_webview(&label) {
            webview
                .navigate(parse_url(&url)?)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(
    app: AppHandle,
    host: State<'_, Mutex<BrowserHost>>,
    pane_id: String,
    url: String,
) -> Result<(), String> {
    let label = webview_label(&pane_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "browser webview not found".to_string())?;
    webview
        .navigate(parse_url(&url)?)
        .map_err(|e| e.to_string())?;
    if let Some(pane) = host.lock().panes.get_mut(&pane_id) {
        pane.url = url;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_back(app: AppHandle, pane_id: String) -> Result<(), String> {
    let label = webview_label(&pane_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "browser webview not found".to_string())?;
    webview
        .eval("window.history.back()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_forward(app: AppHandle, pane_id: String) -> Result<(), String> {
    let label = webview_label(&pane_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "browser webview not found".to_string())?;
    webview
        .eval("window.history.forward()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_reload(app: AppHandle, pane_id: String) -> Result<(), String> {
    let label = webview_label(&pane_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "browser webview not found".to_string())?;
    webview.reload().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_toggle_devtools(
    app: AppHandle,
    host: State<'_, Mutex<BrowserHost>>,
    pane_id: String,
) -> Result<bool, String> {
    let label = webview_label(&pane_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "browser webview not found".to_string())?;
    if webview.is_devtools_open() {
        webview.close_devtools();
    } else {
        webview.open_devtools();
    }
    let now_open = webview.is_devtools_open();

    // WKWebView's native inspector docks *inside* its own NSView by growing
    // that view rightward — it assumes it owns a full browser window, not a
    // small embedded pane, so opening it pushes past whatever bounds we gave
    // it and into neighboring app UI (the sidebar). Rather than fight that by
    // resetting to the original frame (which would just cram the inspector
    // into no extra room), give it the room it wants up front: shrink our
    // webview's own width by DEVTOOLS_RESERVED_WIDTH so the inspector has
    // space to dock *within* bounds we still control, instead of past them.
    // `apply_pane` reads `devtools_open` on every subsequent resize sync too,
    // so a later window/pane resize doesn't undo this.
    let content = {
        let mut guard = host.lock();
        guard.devtools_open.insert(pane_id.clone(), now_open);
        guard.applied_frames.get(&pane_id).cloned()
    };
    if let Some(content) = content {
        let app = app.clone();
        // The inspector's own resize isn't synchronous with
        // open_devtools()/close_devtools() returning, so reapply shortly
        // after instead of racing it.
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let inner_app = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(webview) = inner_app.get_webview(&label) {
                    let width = if now_open {
                        (content.width - DEVTOOLS_RESERVED_WIDTH).max(200.0)
                    } else {
                        content.width
                    };
                    let _ = webview.set_position(LogicalPosition::new(content.x, content.y));
                    let _ = webview.set_size(LogicalSize::new(width, content.height));
                }
            });
        });
    }

    Ok(now_open)
}

#[tauri::command]
pub async fn browser_hide_all(
    app: AppHandle,
    host: State<'_, Mutex<BrowserHost>>,
) -> Result<(), String> {
    let pane_ids: Vec<String> = host.lock().panes.keys().cloned().collect();
    for pane_id in pane_ids {
        if let Some(pane) = host.lock().panes.get_mut(&pane_id) {
            pane.visible = false;
        }
        let label = webview_label(&pane_id);
        if let Some(webview) = app.get_webview(&label) {
            webview.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_cleanup_all(
    app: AppHandle,
    host: State<'_, Mutex<BrowserHost>>,
) -> Result<(), String> {
    cleanup_browser_webviews(&app);
    let mut guard = host.lock();
    guard.panes.clear();
    guard.applied_frames.clear();
    guard.devtools_open.clear();
    Ok(())
}

#[tauri::command]
pub async fn browser_detach(
    app: AppHandle,
    host: State<'_, Mutex<BrowserHost>>,
    pane_id: String,
) -> Result<(), String> {
    let label = webview_label(&pane_id);
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    let mut guard = host.lock();
    guard.panes.remove(&pane_id);
    guard.applied_frames.remove(&pane_id);
    guard.devtools_open.remove(&pane_id);
    Ok(())
}

pub fn attach_window_events(app: &AppHandle) {
    let Some(window) = app.get_window("main") else {
        return;
    };
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_) | WindowEvent::Moved(_)) {
            let host = app_handle.state::<Mutex<BrowserHost>>();
            let mut guard = host.lock();
            let _ = sync_all_visible(&app_handle, &mut guard);
        }
    });
}
