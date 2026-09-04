use std::sync::Once;

use napi::bindgen_prelude::*;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, RegisterClassW, SetParent, ShowWindow, CS_HREDRAW, CS_VREDRAW, SW_SHOW, WS_CHILD,
    WS_VISIBLE, WNDCLASSW,
};
use world_engine_core::init_gpu_win32;

use crate::render_loop::spawn_render_loop;

static REGISTER_CLASS: Once = Once::new();
const CLASS_NAME: &[u16] = &[
    b'W' as u16, b'E' as u16, b'E' as u16, b'm' as u16, b'b' as u16, b'e' as u16, b'd' as u16, 0,
];

fn ensure_window_class() {
    REGISTER_CLASS.call_once(|| unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(windows_sys::Win32::UI::WindowsAndMessaging::DefWindowProcW),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: CLASS_NAME.as_ptr(),
        };
        RegisterClassW(&wc);
    });
}

fn create_child_hwnd(parent: HWND, width: i32, height: i32) -> HWND {
    ensure_window_class();
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let hwnd = CreateWindowExW(
            0,
            CLASS_NAME.as_ptr(),
            std::ptr::null(),
            WS_CHILD | WS_VISIBLE,
            0,
            0,
            width,
            height,
            parent,
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if hwnd == 0 {
            panic!("CreateWindowExW failed for World Engine embed host");
        }
        SetParent(hwnd, parent);
        ShowWindow(hwnd, SW_SHOW);
        hwnd
    }
}

pub fn start(native_window_handle: &[u8], width: u32, height: u32) -> Result<()> {
    if native_window_handle.len() < std::mem::size_of::<isize>() {
        return Err(Error::from_reason("expected a native window handle buffer"));
    }
    let mut bytes = [0u8; 8];
    bytes[..native_window_handle.len().min(8)].copy_from_slice(&native_window_handle[..native_window_handle.len().min(8)]);
    let parent_hwnd = isize::from_le_bytes(bytes) as HWND;
    if parent_hwnd == 0 {
        return Err(Error::from_reason("Electron native window handle was null"));
    }

    let child = create_child_hwnd(parent_hwnd, width as i32, height as i32);
    let gpu = init_gpu_win32(child as *mut std::ffi::c_void, width, height, None);
    spawn_render_loop(gpu);
    Ok(())
}
