// World Engine — Phase 2: true in-process embedding into an Electron
// window. See docs/architecture/09-future-native-architecture.md.
//
// macOS: NSView subview + wgpu (verified). Windows: child HWND + SetParent
// + wgpu (Phase 2B). Input forwarding is still experimental — qt-shell
// separate window remains the default integration in the Workspace app.

mod platform;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod render_loop;

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Called from Electron's main process with `mainWindow.getNativeWindowHandle()`
/// plus the pane's pixel size. Spawns a dedicated thread that steps physics and
/// renders via `world-engine-core` directly into a native child view/HWND.
#[napi]
pub fn start_embedded_engine(native_window_handle: Buffer, width: u32, height: u32) -> Result<()> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        return platform::start(&native_window_handle, width, height);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (native_window_handle, width, height);
        Err(Error::from_reason(
            "world-engine-electron-embed is only built for macOS and Windows",
        ))
    }
}
