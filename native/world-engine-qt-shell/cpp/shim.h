#pragma once

// Minimal C ABI so Rust can drive a real Qt native window without any
// Qt/C++ knowledge on the Rust side beyond these functions. No QML, no
// cxx-qt, no moc — a QWidget subclass overriding plain virtual event
// methods is the whole "shell" (overriding virtuals doesn't need
// Q_OBJECT/moc, only new signals/slots/properties do — kept out on
// purpose, see docs/architecture/09-future-native-architecture.md).
extern "C" {

// Called once, right after the native window/view exists, with its
// platform-native handle (an NSView* on macOS) — Rust uses this to
// build a wgpu surface targeting the real window, not a headless texture.
typedef void (*InitCallback)(void *native_view_handle, void *user_data);

// Called on a timer tick from inside Qt's own event loop (~30fps) —
// Rust steps physics and renders one frame directly into the surface
// created in InitCallback.
typedef void (*FrameCallback)(void *user_data);

enum InputEventType {
    kMouseDown = 0,
    kMouseUp = 1,
    kMouseDrag = 2, // dx/dy are the pixel delta since the last drag event
    kWheel = 3,     // dy is the wheel delta (positive = away from the user)
};

// A real native window already receives mouse/keyboard input natively —
// no InteractionCoordinator-style overlay/pointer-events problem exists
// here at all (see the doc's own note on why Phase 2's embedded approach
// was the one with an unsolved input story, not this one). This just
// forwards what Qt already received.
typedef void (*InputCallback)(int type, float x, float y, float dx, float dy, void *user_data);

// Creates a QApplication + a QWidget of the given size, shows it, invokes
// init_cb once with its native handle, wires frame_cb to a QTimer and
// input_cb to mouse press/move/release/wheel events, then blocks in Qt's
// event loop until the window closes.
void qt_run(
    int width,
    int height,
    InitCallback init_cb,
    FrameCallback frame_cb,
    InputCallback input_cb,
    void *user_data
);

} // extern "C"
