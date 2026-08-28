# world-engine-electron-embed

Phase 2 of World Engine's build-out — **proven, but not the shipped
integration path.** A native Node addon (`napi-rs`) that embeds a
`wgpu`-rendered `NSView` as a direct subview of a real Electron
`BrowserWindow`'s own native view: true in-process embedding, zero IPC
frame transfer, zero video — `wgpu` presents directly to the same window
Electron itself owns.

## Why this exists, and why it isn't used

Verified the mechanism works: loaded into a real (throwaway, not the
Workspace app) Electron process, embedded the view, rendered
continuously with no crash. But its necessary follow-up — routing mouse/
keyboard input from the pane back into the embedded native view instead
of Electron's transparent web layer swallowing it — has **no reference
implementation anywhere**, unlike every other piece of this build-out
(each of which followed a real, verified example). Asked the user
directly whether to accept that open-ended risk or decouple instead;
decoupled. World Engine ships as
[`../world-engine-qt-shell/`](../world-engine-qt-shell/) — its own
separate native window, spawned and managed as a child process — which
has *zero* input-forwarding problem at all, since it's a genuine
independent native window.

This crate is kept, not deleted: a real, working, documented option to
revisit if a genuinely seamless embedded pane is ever worth solving that
input problem for. Full reasoning in
[`docs/architecture/09-future-native-architecture.md`](../../docs/architecture/09-future-native-architecture.md).

## How it works

1. Electron's main process calls `mainWindow.getNativeWindowHandle()` and
   passes the raw bytes to this addon.
2. `start_embedded_engine` (in `src/lib.rs`) reads that as an `NSView*`,
   creates our **own** `NSView` (via `objc2`/`objc2-app-kit` — a view we
   fully control, not someone else's window), and adds it as a subview of
   Electron's content view (`addSubview_positioned_relativeTo`, `Below`).
3. `wgpu` builds a surface directly from that new `NSView`
   (`raw-window-handle`, the same crate `wgpu`/`winit` use internally).
   This setup runs on Electron's main/UI thread — AppKit view mutation
   off the main thread isn't safe, even though the *drawing* that follows
   is (the standard, documented Metal pattern).
4. A dedicated Rust thread steps physics and renders every ~33ms into the
   already-configured surface — same physics-driven cube as the other
   World Engine crates (`rapier3d` + `hecs`).

Followed a real reference implementation closely rather than guessing
the `objc2`/`napi-rs` call shapes:
[monkeynut.org's "Using wgpu with Electron on macOS"](https://www.monkeynut.org/wgpu-electron/) —
compiled clean on the first real attempt as a result.

## Build

```sh
cargo build
cp target/debug/libworld_engine_electron_embed.dylib target/debug/world_engine_electron_embed.node
```

Then from an Electron main process:

```js
const addon = require("/path/to/target/debug/world_engine_electron_embed.node");
mainWindow.setBackgroundColor("#00000000"); // let the native view show through
addon.startEmbeddedEngine(mainWindow.getNativeWindowHandle(), width, height);
```

macOS only (`objc2-app-kit`) — Windows/Linux embedding is real follow-up
work, not attempted here.
