#pragma once

// Minimal C ABI so Rust can drive a real Qt native window without any
// Qt/C++ knowledge on the Rust side beyond these four functions. No
// QML, no cxx-qt, no moc — a bare QWidget is the whole "shell" for this
// Phase 1 spike (see docs/architecture/09-future-native-architecture.md).
extern "C" {

// Called once, right after the native window/view exists, with its
// platform-native handle (an NSView* on macOS) — Rust uses this to
// build a wgpu surface targeting the real window, not a headless texture.
typedef void (*InitCallback)(void *native_view_handle, void *user_data);

// Called on a timer tick from inside Qt's own event loop (~30fps) —
// Rust steps physics and renders one frame directly into the surface
// created in InitCallback.
typedef void (*FrameCallback)(void *user_data);

// Creates a QApplication + a plain QWidget of the given size, shows it,
// invokes init_cb once with its native handle, wires frame_cb to a
// QTimer, then blocks in Qt's event loop until the window closes.
void qt_run(int width, int height, InitCallback init_cb, FrameCallback frame_cb, void *user_data);

} // extern "C"
