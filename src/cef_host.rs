//! Off-screen-rendered CEF browser, embedded alongside Tauri's own window.
//!
//! Windowed CEF (a real NSView child) requires `NSApp` itself to be an
//! instance of a CEF-conforming `NSApplication` subclass on macOS — a
//! requirement that directly conflicts with Tauri/tao already owning
//! `NSApp`. OSR sidesteps this entirely: CEF renders into an off-screen
//! pixel buffer (no native window/view of its own), so it never needs to
//! touch `NSApplication`. We deliver that buffer to the frontend and let it
//! paint into a `<canvas>`, and forward the canvas's own input events back
//! into CEF — the browser pane becomes "just a video feed we control",
//! composited entirely normally within our existing DOM/flexlayout stack
//! (no native z-order fighting).
//!
//! CEF also cannot run its own blocking `run_message_loop()` here (same
//! reason: it wants to own the run loop, tao already does). Settings sets
//! `external_message_pump`, and `pump()` — driven from the same poll loop
//! that already services PTY output — pumps it a tick at a time instead.

use cef::rc::Rc as _;
use cef::{
    App, BrowserProcessHandler, BrowserSettings, CefString, Client, ImplApp,
    ImplBrowserProcessHandler, ImplClient, ImplCommandLine, ImplRenderHandler, PaintElementType,
    Rect, RenderHandler, ScreenInfo, Settings, WindowInfo, WrapApp, WrapBrowserProcessHandler,
    WrapClient, WrapRenderHandler, args::Args, browser_host_create_browser, do_message_loop_work,
    execute_process, initialize, wrap_app, wrap_browser_process_handler, wrap_client,
    wrap_render_handler,
};
use std::cell::RefCell;
use std::os::raw::c_int;
use std::sync::atomic::{AtomicU64, Ordering};

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

/// Initializes the CEF context. Must run after
/// `dispatch_subprocess_and_check_is_browser_process` returned `true`.
/// Browsers can only be created once `on_context_initialized` has fired
/// (asynchronous — poll `is_ready()`).
pub fn initialize_cef() {
    let mut app = build_app();
    let settings = Settings {
        windowless_rendering_enabled: true as c_int,
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

/// Pump CEF's message loop by one tick. Call this frequently (same cadence
/// as the existing PTY poll) — `external_message_pump` means nothing else
/// drives CEF's work otherwise.
pub fn pump() {
    do_message_loop_work();
}

pub fn is_ready() -> bool {
    CEF_READY.load(Ordering::Acquire) != 0
}

pub fn shutdown() {
    cef::shutdown();
}

static CEF_READY: AtomicU64 = AtomicU64::new(0);
static FRAMES_SEEN: AtomicU64 = AtomicU64::new(0);

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
    }
}

wrap_browser_process_handler! {
    struct BrowserProcessHandlerBuilder {}

    impl BrowserProcessHandler {
        fn on_context_initialized(&self) {
            CEF_READY.store(1, Ordering::Release);
            eprintln!("[cef] context initialized — ready to create browsers");
        }
    }
}

/// First-cut proof of the OSR pipeline: create a browser and log how many
/// paint frames arrive. No frontend delivery yet, no input forwarding yet —
/// this only exists to prove CEF renders while Tauri's own window is alive,
/// before building the (much larger) frame-delivery + input pipeline on top.
pub fn spawn_probe_browser(url: &str) {
    let window_info = WindowInfo {
        windowless_rendering_enabled: 1,
        ..Default::default()
    };
    let browser_settings = BrowserSettings {
        windowless_frame_rate: 30,
        ..Default::default()
    };
    let mut client = ClientBuilder::build(RenderHandlerBuilder::build());
    let url = CefString::from(url);
    let browser = browser_host_create_browser(
        Some(&window_info),
        Some(&mut client),
        Some(&url),
        Some(&browser_settings),
        None,
        None,
    );
    eprintln!("[cef] spawn_probe_browser created={}", browser != 0);
}

#[derive(Clone)]
struct ProbeRenderHandler {
    size: RefCell<(f32, f32)>,
}

wrap_render_handler! {
    struct RenderHandlerBuilder {
        handler: ProbeRenderHandler,
    }

    impl RenderHandler {
        fn view_rect(&self, _browser: Option<&mut cef::Browser>, rect: Option<&mut Rect>) {
            if let Some(rect) = rect {
                let (w, h) = *self.handler.size.borrow();
                rect.x = 0;
                rect.y = 0;
                rect.width = w as c_int;
                rect.height = h as c_int;
            }
        }

        fn screen_info(
            &self,
            _browser: Option<&mut cef::Browser>,
            screen_info: Option<&mut ScreenInfo>,
        ) -> c_int {
            if let Some(screen_info) = screen_info {
                screen_info.device_scale_factor = 1.0;
                return 1;
            }
            0
        }

        fn on_paint(
            &self,
            _browser: Option<&mut cef::Browser>,
            _type_: PaintElementType,
            _dirty_rects: Option<&[Rect]>,
            buffer: *const u8,
            width: c_int,
            height: c_int,
        ) {
            if buffer.is_null() || width <= 0 || height <= 0 {
                return;
            }
            let n = FRAMES_SEEN.fetch_add(1, Ordering::Relaxed) + 1;
            if n <= 5 || n % 60 == 0 {
                eprintln!("[cef] on_paint frame={n} {width}x{height}");
            }
        }
    }
}

impl RenderHandlerBuilder {
    fn build() -> RenderHandler {
        Self::new(ProbeRenderHandler {
            size: RefCell::new((800.0, 600.0)),
        })
    }
}

wrap_client! {
    struct ClientBuilder {
        render_handler: RenderHandler,
    }

    impl Client {
        fn render_handler(&self) -> Option<RenderHandler> {
            Some(self.render_handler.clone())
        }
    }
}

impl ClientBuilder {
    fn build(render_handler: RenderHandler) -> Client {
        Self::new(render_handler)
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
