//! Windowed CEF browser panes, embedded alongside Tauri's own window.
//!
//! Started as OSR (off-screen rendering, software pixel buffer painted into
//! a `<canvas>`) to sidestep `NSApp` ownership conflicts with Tauri/tao —
//! but OSR turned out to have a real, unresolved bug: mouse clicks reached
//! CEF's API (`SendMouseClickEvent` succeeded) but never reached the page's
//! own JS/DOM. This is a known, recurring category of bug in CEF's OSR mode
//! specifically (multiple CEF forum threads report the same symptom), not
//! something specific to this integration.
//!
//! This is the windowed replacement: a real child `NSView`, parented onto
//! the main Tauri window's content view exactly like the WKWebView `browser`
//! panes in `browser_host.rs` already are (`add_child`-style native view
//! embedding, not OSR/off-screen). Verified working end-to-end, including
//! real clicks reaching page JS (`onclick` handlers fire).
//!
//! CEF's own header (`cef_application_mac.h`) says client apps "must
//! subclass NSApplication and implement [`CefAppProtocol`]" — `tao` already
//! builds its own `NSApplication` subclass ("TaoApp") *at runtime* via
//! `objc2::runtime::ClassBuilder` (see `tao::platform_impl::macos::app`), so
//! instead of forking tao or replacing Tauri's whole runtime (as the
//! upstream `tauri-runtime-cef` branch does), `inject_cef_app_protocol`
//! injects the methods CEF actually probes (`isHandlingSendEvent`/
//! `setHandlingSendEvent:`, checked via `respondsToSelector:` duck-typing —
//! `CefAppProtocol` isn't a discoverable runtime `Protocol` object in the
//! shipped `libcef` binary, confirmed via `nm`/`otool`, so `class_addProtocol`
//! itself is a no-op here) directly onto that already-registered class.
//!
//! CEF cannot run its own blocking `run_message_loop()` here (it wants to
//! own the run loop; tao already does). `external_message_pump` puts CEF in
//! "call me when you have something to do" mode: CEF calls
//! `on_schedule_message_pump_work(delay_ms)` to say when it next needs
//! `do_message_loop_work()`; we honor that via `AppHandle::run_on_main_thread`
//! so Tauri keeps driving `.run()` normally and CEF just piggybacks on it.
//!
//! Every CEF call must happen on the thread `cef::initialize` ran on (the
//! same one Tauri's main loop runs on), so every public function here that
//! touches a `Browser`/`BrowserHost` dispatches through
//! `AppHandle::run_on_main_thread` rather than calling CEF directly.

use cef::rc::Rc as _;
use cef::{
    App, Browser, BrowserProcessHandler, BrowserSettings, CefString, Client, DisplayHandler,
    Errorcode, Frame, ImplApp, ImplBrowser, ImplBrowserHost, ImplBrowserProcessHandler,
    ImplClient, ImplCommandLine, ImplDisplayHandler, ImplFrame, ImplLoadHandler, LoadHandler,
    Rect, Settings, TransitionType, WindowInfo, WrapApp, WrapBrowserProcessHandler, WrapClient,
    WrapDisplayHandler, WrapLoadHandler, args::Args, browser_host_create_browser_sync,
    do_message_loop_work, execute_process, initialize, wrap_app, wrap_browser_process_handler,
    wrap_client, wrap_display_handler, wrap_load_handler,
};
use serde::Serialize;
use std::collections::HashMap;
use std::os::raw::c_int;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static PANES: OnceLock<Mutex<HashMap<String, PaneState>>> = OnceLock::new();
static CEF_READY: AtomicU64 = AtomicU64::new(0);

/// Same measured constant as `browser_host::TITLE_BAR_INSET`: on macOS,
/// `add_child`-style native views (WKWebView *and* a CEF `NSView`, same
/// parenting mechanism) are positioned relative to the window's full content
/// view, but the DOM coordinates our placeholder `<div>` reports start below
/// the title bar — so without this offset every pane renders one title-bar
/// height too high.
const TITLE_BAR_INSET: f64 = 32.0;

/// Logical (DIP) position/size, relative to the main window's content view —
/// same coordinate space `browser_host.rs`'s `Frame` uses for WKWebView
/// child views.
#[derive(Clone)]
struct PaneFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct PaneState {
    browser: Browser,
    url: String,
}

fn panes() -> &'static Mutex<HashMap<String, PaneState>> {
    PANES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Call once from Tauri's `.setup()`, before `initialize_cef()`.
pub fn set_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

fn on_main(f: impl FnOnce() + Send + 'static) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.run_on_main_thread(f);
    }
}

/// Call at the very top of `main`, before any Tauri/tao setup. CEF spawns
/// itself as several helper subprocesses (GPU, renderer, network, ...); each
/// one re-execs this same binary and must exit here without ever reaching
/// Tauri's own window/event-loop setup. Returns `true` only for the one
/// process that should continue on to become the actual app.
pub fn dispatch_subprocess_and_check_is_browser_process() -> bool {
    #[cfg(target_os = "macos")]
    {
        let loader =
            cef::library_loader::LibraryLoader::new(&std::env::current_exe().unwrap(), false);
        assert!(loader.load(), "failed to load libcef");
        // Intentionally leaked: must outlive the whole process.
        std::mem::forget(loader);
    }

    let _ = cef::api_hash(cef::sys::CEF_API_VERSION_LAST, 0);

    let args = Args::new();
    let Some(cmd_line) = args.as_cmd_line() else {
        return false;
    };
    let is_browser_process = cmd_line.has_switch(Some(&CefString::from("type"))) != 1;

    let mut app = build_app();
    let ret = execute_process(Some(args.as_main_args()), Some(&mut app), std::ptr::null_mut());

    if is_browser_process {
        assert_eq!(ret, -1, "cannot execute browser process");
        true
    } else {
        assert!(ret >= 0, "cannot execute non-browser process");
        false
    }
}

/// See module docs. Must run after CEF's context is initialized (its own
/// Objective-C runtime state isn't guaranteed set up any earlier).
#[cfg(target_os = "macos")]
fn inject_cef_app_protocol() {
    use objc2::encode::{Encode, EncodeReturn, Encoding};
    use objc2::ffi as objc_ffi;
    use objc2::runtime::{AnyClass, AnyObject, AnyProtocol, Bool, Imp, Sel};
    use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};

    static HANDLING_SEND_EVENT: AtomicBool = AtomicBool::new(false);

    extern "C" fn is_handling_send_event(_this: &AnyObject, _sel: Sel) -> Bool {
        Bool::new(HANDLING_SEND_EVENT.load(AtomicOrdering::Relaxed))
    }

    extern "C" fn set_handling_send_event(_this: &AnyObject, _sel: Sel, value: Bool) {
        HANDLING_SEND_EVENT.store(value.as_bool(), AtomicOrdering::Relaxed);
    }

    fn type_encoding(ret: &Encoding, args: &[Encoding]) -> std::ffi::CString {
        use std::fmt::Write;
        let mut types = format!("{ret}{}{}", <*mut AnyObject>::ENCODING, Sel::ENCODING);
        for enc in args {
            write!(&mut types, "{enc}").unwrap();
        }
        std::ffi::CString::new(types).unwrap()
    }

    let Some(class) = AnyClass::get(c"TaoApp") else {
        eprintln!("[cef] inject_cef_app_protocol: TaoApp class not found, skipping");
        return;
    };
    let class_ptr = class as *const AnyClass as *mut AnyClass;

    if let Some(protocol) = AnyProtocol::get(c"CefAppProtocol") {
        unsafe { objc_ffi::class_addProtocol(class_ptr, protocol) };
    }

    unsafe {
        let sel = Sel::register(c"isHandlingSendEvent");
        let types = type_encoding(&Bool::ENCODING, &[]);
        let imp: Imp = std::mem::transmute::<
            extern "C" fn(&AnyObject, Sel) -> Bool,
            Imp,
        >(is_handling_send_event);
        objc_ffi::class_addMethod(class_ptr, sel, imp, types.as_ptr());
    }

    unsafe {
        let sel = Sel::register(c"setHandlingSendEvent:");
        let types = type_encoding(&<() as EncodeReturn>::ENCODING_RETURN, &[Bool::ENCODING]);
        let imp: Imp = std::mem::transmute::<
            extern "C" fn(&AnyObject, Sel, Bool),
            Imp,
        >(set_handling_send_event);
        objc_ffi::class_addMethod(class_ptr, sel, imp, types.as_ptr());
    }
}

/// Initializes the CEF context. Must run after
/// `dispatch_subprocess_and_check_is_browser_process` returned `true`, and
/// after `set_app_handle`.
pub fn initialize_cef() {
    let mut app = build_app();
    let settings = Settings {
        external_message_pump: true as c_int,
        no_sandbox: 1,
        ..Default::default()
    };
    let args = Args::new();
    assert_eq!(
        initialize(
            Some(args.as_main_args()),
            Some(&settings),
            Some(&mut app),
            std::ptr::null_mut(),
        ),
        1,
        "cef::initialize failed"
    );
}

pub fn shutdown() {
    cef::shutdown();
}

/// Started once, from `on_context_initialized`. Pumps CEF's message loop on
/// a fixed ~60fps interval forever, instead of relying on CEF's own
/// `on_schedule_message_pump_work` callback (which goes idle once a page
/// settles — fine for OSR's continuous redraw needs, but windowed CEF then
/// has no path to wake back up on real native input, since a click on the
/// view doesn't itself trigger this callback). A single persistent thread
/// (not one spawned per pump like the old callback-driven approach) so this
/// doesn't create unbounded thread churn under heavy interaction.
fn spawn_pump_loop() {
    let Some(handle) = APP_HANDLE.get() else {
        return;
    };
    let handle = handle.clone();
    std::thread::spawn(move || {
        static PUMP_COUNT: AtomicU64 = AtomicU64::new(0);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(16));
            let pn = PUMP_COUNT.fetch_add(1, Ordering::Relaxed);
            let result = handle.run_on_main_thread(do_message_loop_work);
            if let Err(e) = result {
                eprintln!("[cef] pump_loop #{pn}: run_on_main_thread FAILED: {e:?}");
            } else if pn % 300 == 0 {
                eprintln!("[cef] pump_loop #{pn} ran (heartbeat)");
            }
        }
    });
}

fn build_app() -> App {
    AppBuilder::build(WorkspaceApp {})
}

#[derive(Clone)]
struct WorkspaceApp {}

wrap_app! {
    struct AppBuilder {
        app: WorkspaceApp,
    }

    impl App {
        fn browser_process_handler(&self) -> Option<BrowserProcessHandler> {
            Some(BrowserProcessHandlerBuilder::build())
        }

        // Windowed CEF panes were producing a steady stream of
        // "SharedImageManager::ProduceOverlay: ... non-existent mailbox" /
        // "Invalid mailbox" GPU-compositor errors starting right at first
        // paint, worsening (and eventually crashing the app with no catchable
        // panic/crash report — consistent with the GPU process itself dying)
        // across repeated hide/show cycles from switching workspace tabs.
        // Disabling GPU compositing trades some smoothness for actually not
        // crashing.
        fn on_before_command_line_processing(
            &self,
            _process_type: Option<&CefString>,
            command_line: Option<&mut cef::CommandLine>,
        ) {
            if let Some(command_line) = command_line {
                command_line.append_switch(Some(&CefString::from("disable-gpu-compositing")));
                command_line.append_switch(Some(&CefString::from("disable-gpu")));
            }
        }
    }
}

wrap_browser_process_handler! {
    struct BrowserProcessHandlerBuilder {}

    impl BrowserProcessHandler {
        fn on_context_initialized(&self) {
            CEF_READY.store(1, Ordering::Release);
            #[cfg(target_os = "macos")]
            inject_cef_app_protocol();
            spawn_pump_loop();
        }

        // Intentionally not acted on: see `spawn_pump_loop`. Trusting CEF's
        // own "call me back in delay_ms" scheduling turned out to actually
        // go idle once a page settles (no more scheduled work) — unlike
        // OSR, which was observed to self-perpetuate continuously forever
        // regardless of page activity. Once idle, a real native click on
        // the windowed view has no path to wake this callback back up, so
        // the browser stops processing input entirely (confirmed via
        // logging: the pump's own heartbeat counter stopped advancing
        // within ~1s of the page settling, with zero user interaction in
        // between). A fixed-interval fallback pump below replaces this.
        fn on_schedule_message_pump_work(&self, _delay_ms: i64) {}
    }
}

impl AppBuilder {
    fn build(app: WorkspaceApp) -> App {
        Self::new(app)
    }
}

impl BrowserProcessHandlerBuilder {
    fn build() -> BrowserProcessHandler {
        Self::new()
    }
}

#[cfg(target_os = "macos")]
fn ns_view_for(browser: &Browser) -> Option<*mut objc2_app_kit::NSView> {
    let host = browser.host()?;
    let handle = host.window_handle();
    if handle.is_null() {
        return None;
    }
    Some(handle as *mut objc2_app_kit::NSView)
}

/// `frame.x`/`frame.y` are DOM-style, top-left-origin coordinates (matching
/// what `set_as_child` was given at creation time and what rendered
/// correctly then). `-[NSView setFrame:]` interprets its origin in the
/// *superview's* own coordinate system, which on macOS defaults to
/// bottom-left-origin unless the superview overrides `isFlipped` — so unlike
/// creation (where CEF itself presumably does this translation), a raw
/// `setFrame:` call here needs to flip `y` by hand when the superview isn't
/// flipped, or every reposition after the first ends up vertically mirrored
/// within the parent.
#[cfg(target_os = "macos")]
fn apply_frame(browser: &Browser, frame: &PaneFrame, visible: bool) {
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    let Some(view_ptr) = ns_view_for(browser) else {
        return;
    };
    let view: &objc2_app_kit::NSView = unsafe { &*view_ptr };

    let y = match unsafe { view.superview() } {
        Some(superview) if !superview.isFlipped() => {
            superview.bounds().size.height - frame.y - frame.height
        }
        _ => frame.y,
    };

    view.setFrame(NSRect::new(
        NSPoint::new(frame.x, y),
        NSSize::new(frame.width, frame.height),
    ));
    view.setHidden(!visible);
}

#[cfg(target_os = "macos")]
fn set_hidden(browser: &Browser, hidden: bool) {
    let Some(view_ptr) = ns_view_for(browser) else {
        return;
    };
    let view: &objc2_app_kit::NSView = unsafe { &*view_ptr };
    view.setHidden(hidden);
}

/// Create (if `pane_id` doesn't already exist) and position a windowed CEF
/// browser pane — the CEF equivalent of `browser_host.rs`'s
/// `browser_report_frame`, called on every resize/scroll/overlay-unblock.
/// `x`/`y`/`width`/`height` are logical (DIP) pixels relative to the main
/// window's content view (same space the WKWebView panes use — the frontend
/// already computes this via `measureElementRect` + the title-bar inset in
/// `browser_host.rs`).
///
/// Deliberately does *not* re-navigate an already-existing pane on a URL
/// mismatch (unlike the WKWebView version this mirrors): `url` here is just
/// "what to load if this pane doesn't exist yet". Once created, the
/// frontend's own idea of "current URL" only updates on an explicit
/// `cef_navigate` call (Enter in the address bar) — it has no way to learn
/// about in-page navigation the site itself does (e.g. Google search
/// autocomplete rewriting the URL as you type). Re-navigating on every
/// resize/scroll tick to the frontend's now-stale URL fought the site's own
/// navigation and aborted every load in a loop.
#[cfg(target_os = "macos")]
pub fn report_frame(pane_id: String, url: String, frame: PaneFrameArgs, visible: bool) {
    static CALL_COUNT: AtomicU64 = AtomicU64::new(0);
    let n = CALL_COUNT.fetch_add(1, Ordering::Relaxed);
    eprintln!(
        "[cef] report_frame #{n} invoked pane={pane_id} url={url} rect=({:.0},{:.0},{:.0}x{:.0}) visible={visible} panes_now={:?}",
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        panes().lock().unwrap().keys().cloned().collect::<Vec<_>>(),
    );
    on_main(move || {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        use tauri::Manager;

        let frame = PaneFrame {
            x: frame.x,
            y: frame.y + TITLE_BAR_INSET,
            width: frame.width,
            height: frame.height,
        };

        if let Some(pane) = panes().lock().unwrap().get(&pane_id) {
            eprintln!("[cef] report_frame #{n}: {pane_id} exists, repositioning only");
            apply_frame(&pane.browser, &frame, visible);
            return;
        }
        eprintln!("[cef] report_frame #{n}: {pane_id} does NOT exist, creating browser now");

        let Some(handle) = APP_HANDLE.get() else {
            return;
        };
        let Some(window) = handle.get_window("main") else {
            eprintln!("[cef] report_frame: no main window");
            return;
        };
        let Ok(wh) = window.window_handle() else {
            eprintln!("[cef] report_frame: window_handle() failed");
            return;
        };
        let RawWindowHandle::AppKit(appkit) = wh.as_raw() else {
            eprintln!("[cef] report_frame: not an AppKit window handle");
            return;
        };
        let parent_view = appkit.ns_view.as_ptr() as cef::sys::cef_window_handle_t;

        let bounds = Rect {
            x: frame.x as c_int,
            y: frame.y as c_int,
            width: frame.width.max(1.0) as c_int,
            height: frame.height.max(1.0) as c_int,
        };
        let window_info = WindowInfo::default().set_as_child(parent_view, &bounds);
        let browser_settings = BrowserSettings::default();
        let mut client = ClientBuilder::build(
            LoadHandlerBuilder::build(pane_id.clone()),
            DisplayHandlerBuilder::build(pane_id.clone()),
        );
        let cef_url = CefString::from(url.as_str());
        // The final `None` is `request_context`: passing none means every
        // CEF pane shares CEF's one global/default context, so cookies,
        // localStorage, and session state are already shared across every
        // Chromium pane app-wide — same as the WKWebView panes sharing
        // `WKWebsiteDataStore::defaultDataStore` in `browser_host.rs`. Do
        // not pass a per-pane `RequestContext` here without a deliberate
        // reason; that would silently isolate panes into separate profiles.
        let Some(browser) = browser_host_create_browser_sync(
            Some(&window_info),
            Some(&mut client),
            Some(&cef_url),
            Some(&browser_settings),
            None,
            None,
        ) else {
            eprintln!("[cef] report_frame: create_browser failed for {pane_id}");
            return;
        };
        apply_frame(&browser, &frame, visible);
        panes()
            .lock()
            .unwrap()
            .insert(pane_id, PaneState { browser, url });
    });
}

/// Plain-data twin of `PaneFrame` for crossing the `on_main` closure
/// boundary before `report_frame` converts it.
pub struct PaneFrameArgs {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Looks up `pane_id` in the registry, logging (and returning `None`) if
/// it's missing.
fn find_pane<'a>(
    guard: &'a std::sync::MutexGuard<'a, HashMap<String, PaneState>>,
    who: &str,
    pane_id: &str,
) -> Option<&'a PaneState> {
    match guard.get(pane_id) {
        Some(p) => Some(p),
        None => {
            eprintln!("[cef] {who}: pane {pane_id} not found (not created yet, or already closed)");
            None
        }
    }
}

/// Explicit navigate for an *already-created* pane (used by the URL bar's
/// Enter-to-navigate flow). `report_frame`'s own URL-change detection
/// handles navigation for the create/reposition path; this exists
/// separately so the frontend doesn't have to also resend position/size
/// just to change the URL.
pub fn navigate_pane(pane_id: String, url: String) {
    eprintln!("[cef] navigate_pane: dispatching pane={pane_id} url={url}");
    on_main(move || {
        let mut guard = panes().lock().unwrap();
        let Some(pane) = guard.get_mut(&pane_id) else {
            eprintln!("[cef] navigate_pane: pane {pane_id} not found");
            return;
        };
        match pane.browser.main_frame() {
            Some(frame) => {
                eprintln!("[cef] navigate_pane: {pane_id} calling load_url({url})");
                frame.load_url(Some(&CefString::from(url.as_str())));
            }
            None => eprintln!("[cef] navigate_pane: {pane_id} has no main_frame()"),
        }
        pane.url = url;
    });
}

pub fn go_back(pane_id: String) {
    on_main(move || {
        let guard = panes().lock().unwrap();
        if let Some(pane) = find_pane(&guard, "go_back", &pane_id) {
            let can = pane.browser.can_go_back();
            eprintln!("[cef] go_back: {pane_id} can_go_back={can}");
            pane.browser.go_back();
        }
    });
}

pub fn go_forward(pane_id: String) {
    on_main(move || {
        let guard = panes().lock().unwrap();
        if let Some(pane) = find_pane(&guard, "go_forward", &pane_id) {
            let can = pane.browser.can_go_forward();
            eprintln!("[cef] go_forward: {pane_id} can_go_forward={can}");
            pane.browser.go_forward();
        }
    });
}

pub fn reload_pane(pane_id: String) {
    on_main(move || {
        let guard = panes().lock().unwrap();
        if let Some(pane) = find_pane(&guard, "reload_pane", &pane_id) {
            pane.browser.reload();
        }
    });
}

/// Not currently wired to any UI button (see `CefToolbar.tsx`): the log
/// trail of the last observed hard freeze ended with this being invoked and
/// nothing after — `show_dev_tools` opens a genuinely new native CEF
/// window, and unlike our own child-view panes, that plausibly needs real
/// nested-run-loop tracking from `inject_cef_app_protocol`'s
/// `isHandlingSendEvent`/`setHandlingSendEvent:`, which are stub
/// implementations (store/return a flag, don't actually participate in
/// AppKit's event dispatch) — good enough for simple child-view click/
/// keyboard input, not proven safe for window-creation-triggering paths.
/// Left in place (command still registered) for when that gets a real
/// implementation.
pub fn toggle_devtools(pane_id: String) {
    on_main(move || {
        let guard = panes().lock().unwrap();
        let Some(pane) = find_pane(&guard, "toggle_devtools", &pane_id) else {
            return;
        };
        let Some(host) = pane.browser.host() else {
            return;
        };
        if host.has_dev_tools() != 0 {
            host.close_dev_tools();
        } else {
            // No `parent`/`window_info` given: DevTools opens as its own
            // real native window rather than trying to dock inside our
            // small pane (which is what made WKWebView's inline inspector
            // spill into neighboring UI — see `browser_host.rs`).
            host.show_dev_tools(None, None, None, None);
        }
    });
}

pub fn close_pane(pane_id: String) {
    eprintln!("[cef] close_pane invoked: {pane_id}");
    on_main(move || {
        if let Some(pane) = panes().lock().unwrap().remove(&pane_id) {
            eprintln!("[cef] close_pane: destroying browser for {pane_id}");
            if let Some(host) = pane.browser.host() {
                host.close_browser(1);
            }
        } else {
            eprintln!("[cef] close_pane: {pane_id} not found");
        }
    });
}

/// Hide (without destroying) a single pane's native view — used instead of
/// `close_pane` when a pane just unmounts because its workspace *tab*
/// switched away (not because the user closed it): actually destroying the
/// browser (`close_browser`) from that teardown path was observed to bring
/// the whole app down with no panic message and no crash report, i.e. a
/// native-level crash below what Rust can catch — plausibly the same class
/// of window/view-lifecycle bug Tauri's own team just fixed upstream for
/// WKWebView child views ("do not close parent window when a child webview
/// is closed"). Hiding instead of destroying sidesteps whatever that
/// teardown sequence trips; `cleanup_all` reaps genuinely-abandoned panes
/// the next time a CEF pane is created.
#[cfg(target_os = "macos")]
pub fn hide_pane(pane_id: String) {
    eprintln!("[cef] hide_pane invoked: {pane_id}");
    on_main(move || {
        if let Some(pane) = panes().lock().unwrap().get(&pane_id) {
            set_hidden(&pane.browser, true);
        } else {
            eprintln!("[cef] hide_pane: {pane_id} not found");
        }
    });
}

/// Hide (or show) every currently registered CEF pane's native view —
/// mirrors `browser_host.rs`'s `browser_hide_all`, used by the overlay
/// barrier (`ui/src/browser/overlayBarrier.ts`) so dropdowns/modals don't
/// get covered by a native child view sitting in its own OS compositing
/// layer above the DOM.
#[cfg(target_os = "macos")]
pub fn hide_all() {
    on_main(|| {
        for pane in panes().lock().unwrap().values() {
            set_hidden(&pane.browser, true);
        }
    });
}

pub fn cleanup_all() {
    eprintln!("[cef] cleanup_all invoked");
    on_main(|| {
        let mut guard = panes().lock().unwrap();
        let ids: Vec<_> = guard.keys().cloned().collect();
        eprintln!("[cef] cleanup_all: destroying panes {ids:?}");
        for (_, pane) in guard.drain() {
            if let Some(host) = pane.browser.host() {
                host.close_browser(1);
            }
        }
    });
}

#[derive(Serialize, Clone)]
struct LoadingPayload {
    #[serde(rename = "paneId")]
    pane_id: String,
    #[serde(rename = "isLoading")]
    is_loading: bool,
    #[serde(rename = "canGoBack")]
    can_go_back: bool,
    #[serde(rename = "canGoForward")]
    can_go_forward: bool,
}

#[derive(Clone)]
struct PaneLoadHandler {
    pane_id: String,
}

wrap_load_handler! {
    struct LoadHandlerBuilder {
        handler: PaneLoadHandler,
    }

    impl LoadHandler {
        fn on_loading_state_change(
            &self,
            _browser: Option<&mut Browser>,
            is_loading: c_int,
            can_go_back: c_int,
            can_go_forward: c_int,
        ) {
            eprintln!(
                "[cef] on_loading_state_change pane={} is_loading={is_loading} can_go_back={can_go_back} can_go_forward={can_go_forward}",
                self.handler.pane_id
            );
            if let Some(handle) = APP_HANDLE.get() {
                let _ = handle.emit(
                    "cef-loading",
                    LoadingPayload {
                        pane_id: self.handler.pane_id.clone(),
                        is_loading: is_loading != 0,
                        can_go_back: can_go_back != 0,
                        can_go_forward: can_go_forward != 0,
                    },
                );
            }
        }

        fn on_load_start(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            _transition_type: TransitionType,
        ) {
            eprintln!("[cef] on_load_start pane={}", self.handler.pane_id);
        }

        fn on_load_end(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            http_status_code: c_int,
        ) {
            eprintln!(
                "[cef] on_load_end pane={} status={http_status_code}",
                self.handler.pane_id
            );
        }

        fn on_load_error(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            error_code: Errorcode,
            error_text: Option<&CefString>,
            failed_url: Option<&CefString>,
        ) {
            eprintln!(
                "[cef] on_load_error pane={} code={:?} text={:?} url={:?}",
                self.handler.pane_id,
                error_code,
                error_text.map(|s| s.to_string()),
                failed_url.map(|s| s.to_string()),
            );
        }
    }
}

impl LoadHandlerBuilder {
    fn build(pane_id: String) -> LoadHandler {
        Self::new(PaneLoadHandler { pane_id })
    }
}

#[derive(Serialize, Clone)]
struct AddressPayload {
    #[serde(rename = "paneId")]
    pane_id: String,
    url: String,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    #[serde(rename = "paneId")]
    pane_id: String,
    progress: f64,
}

#[derive(Clone)]
struct PaneDisplayHandler {
    pane_id: String,
}

wrap_display_handler! {
    struct DisplayHandlerBuilder {
        handler: PaneDisplayHandler,
    }

    impl DisplayHandler {
        // Fires on every navigation *and* in-page URL change (client-side
        // routing, redirects, following a link) — unlike `on_load_start`
        // this is what keeps the toolbar's address bar honest about what's
        // actually on screen after the user clicks something inside the
        // page itself, not just after our own explicit `cef_navigate`.
        fn on_address_change(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            url: Option<&CefString>,
        ) {
            let Some(url) = url else { return };
            if let Some(handle) = APP_HANDLE.get() {
                let _ = handle.emit(
                    "cef-address",
                    AddressPayload {
                        pane_id: self.handler.pane_id.clone(),
                        url: url.to_string(),
                    },
                );
            }
        }

        // Real 0.0-1.0 main-frame load progress, computed by Chromium
        // internally the same way a real browser's address-bar progress
        // indicator is — unlike `LoadHandler::on_loading_state_change`'s
        // `is_loading` flag, this isn't thrown off by background
        // requests/analytics that keep going after the page is usably
        // "done" (that's why the loading bar looked stuck forever on
        // pages like google.com that never go fully idle).
        fn on_loading_progress_change(&self, _browser: Option<&mut Browser>, progress: f64) {
            if let Some(handle) = APP_HANDLE.get() {
                let _ = handle.emit(
                    "cef-progress",
                    ProgressPayload {
                        pane_id: self.handler.pane_id.clone(),
                        progress,
                    },
                );
            }
        }
    }
}

impl DisplayHandlerBuilder {
    fn build(pane_id: String) -> DisplayHandler {
        Self::new(PaneDisplayHandler { pane_id })
    }
}

wrap_client! {
    struct ClientBuilder {
        load_handler: LoadHandler,
        display_handler: DisplayHandler,
    }

    impl Client {
        fn load_handler(&self) -> Option<LoadHandler> {
            Some(self.load_handler.clone())
        }

        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(self.display_handler.clone())
        }
    }
}

impl ClientBuilder {
    fn build(load_handler: LoadHandler, display_handler: DisplayHandler) -> Client {
        Self::new(load_handler, display_handler)
    }
}

#[tauri::command]
pub async fn cef_report_frame(
    pane_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
) {
    #[cfg(target_os = "macos")]
    report_frame(pane_id, url, PaneFrameArgs { x, y, width, height }, visible);
    #[cfg(not(target_os = "macos"))]
    let _ = (pane_id, url, x, y, width, height, visible);
}

#[tauri::command]
pub async fn cef_navigate(pane_id: String, url: String) {
    eprintln!("[cef] cef_navigate invoked: pane={pane_id} url={url}");
    navigate_pane(pane_id, url);
}

#[tauri::command]
pub async fn cef_back(pane_id: String) {
    eprintln!("[cef] cef_back invoked: pane={pane_id}");
    go_back(pane_id);
}

#[tauri::command]
pub async fn cef_forward(pane_id: String) {
    eprintln!("[cef] cef_forward invoked: pane={pane_id}");
    go_forward(pane_id);
}

#[tauri::command]
pub async fn cef_reload(pane_id: String) {
    eprintln!("[cef] cef_reload invoked: pane={pane_id}");
    reload_pane(pane_id);
}

#[tauri::command]
pub async fn cef_toggle_devtools(pane_id: String) {
    eprintln!("[cef] cef_toggle_devtools invoked: pane={pane_id}");
    toggle_devtools(pane_id);
}

#[tauri::command]
pub async fn cef_close_pane(pane_id: String) {
    eprintln!("[cef] cef_close_pane invoked: pane={pane_id}");
    close_pane(pane_id);
}

#[tauri::command]
pub async fn cef_hide_pane(pane_id: String) {
    #[cfg(target_os = "macos")]
    hide_pane(pane_id);
    #[cfg(not(target_os = "macos"))]
    let _ = pane_id;
}

#[tauri::command]
pub async fn cef_hide_all() {
    #[cfg(target_os = "macos")]
    hide_all();
}

#[tauri::command]
pub async fn cef_cleanup_all() {
    cleanup_all();
}
