use napi::bindgen_prelude::*;
use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSView, NSWindowOrderingMode};
use world_engine_core::init_gpu_sized;

use crate::render_loop::spawn_render_loop;

pub fn start(native_window_handle: &[u8], width: u32, height: u32) -> Result<()> {
    if native_window_handle.len() < 8 {
        return Err(Error::from_reason("expected an 8-byte native window handle"));
    }
    let electron_view_ptr = u64::from_le_bytes(native_window_handle[..8].try_into().unwrap()) as *mut std::ffi::c_void;

    let mtm = MainThreadMarker::new()
        .ok_or_else(|| Error::from_reason("start_embedded_engine must be called from Electron's main (UI) thread"))?;

    let electron_view: Retained<NSView> = unsafe { Retained::retain(electron_view_ptr.cast()) }
        .ok_or_else(|| Error::from_reason("Electron's native window handle was null/invalid"))?;

    let our_view = NSView::new(mtm);
    our_view.setFrame(electron_view.frame());
    electron_view.addSubview_positioned_relativeTo(&our_view, NSWindowOrderingMode::Below, None);

    let view_ptr = Retained::as_ptr(&our_view).cast_mut() as *mut std::ffi::c_void;
    let gpu = init_gpu_sized(view_ptr, width, height, None);
    spawn_render_loop(gpu);
    Ok(())
}
