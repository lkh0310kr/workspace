# world-engine-qt-shell

World Engine itself — the real, integrated one. Not a hosted third-party
engine (Godot, Blender, etc.); a real engine assembled from proven
open-source Rust libraries:

- **`wgpu`** — GPU rendering, presenting directly to a real native window
  surface (no offscreen texture, no readback, no video).
- **`rapier3d`** — physics. Gravity and collisions are real, not scripted.
- **`hecs`** — ECS state (each scene entity is a real entity with
  `Transform`/`PhysicsBody`/`Tint` components).
- **Qt 6** — the native window and input (`cpp/shim.cpp`: a plain
  `QWidget` subclass, no QML, no `moc`).

Runs as its own real native window, spawned and managed by the Workspace
app as a child process (`electron/src/main/worldEngine.ts`, mirroring how
`electron/src/main/pty.ts` manages a shell) — **not** embedded as a pane.
See [`../README.md`](../README.md) and
[`docs/architecture/09-future-native-architecture.md`](../../docs/architecture/09-future-native-architecture.md)
for the full reasoning (why not WebRTC, why not in-process NSView
embedding, why Qt).

## Build

```sh
cargo build
```

Requires Qt 6 (`brew install qt`) — `build.rs` currently hardcodes the
Homebrew macOS install path (`/opt/homebrew/opt/qt/lib`). Linux/Windows
Qt linking is real follow-up work, not done yet.

## Run standalone

```sh
./target/debug/world-engine-qt-shell                       # default single-cube demo
./target/debug/world-engine-qt-shell /path/to/project/dir  # loads <dir>/world-engine.json instead
```

## Run from Workspace

App menu → **World Engine → Launch World Engine (dev)** (the default
demo, no project), or right-click a folder containing `world-engine.json`
in the file tree → **Open in World Engine**. A real example project
lives at `electron/test-fixtures/world-engine-demo/`.

## Scene format (`world-engine.json`)

Deliberately minimal — a flat list of cubes, each an independent dynamic
rigid body:

```json
{
  "entities": [
    { "position": [0, 2.5, 0], "rotation": [0.4, 0.6, 0], "restitution": 0.6, "color": [0.9, 0.2, 0.2] }
  ]
}
```

`rotation` is an axis-angle vector (direction = axis, magnitude =
radians — `rapier3d`'s own convention for 3D rigid bodies). Missing
fields default (`restitution` → `0.6`, `color` → red, `position`/
`rotation` → origin/identity). No meshes, no materials, no scripting yet
— real future scope, not pretended at here.

## Controls

Drag to orbit the camera around the scene origin, scroll to zoom — real
Qt mouse/wheel events, forwarded from `cpp/shim.cpp`'s `EngineWidget`
(overrides `mousePressEvent`/`mouseMoveEvent`/`mouseReleaseEvent`/
`wheelEvent` — no `Q_OBJECT`/`moc` needed, since overriding an existing
virtual isn't a new signal/slot) to Rust's `on_input` in `src/main.rs`.
No embedding-related input problem exists for this crate at all, since
it's a genuine independent native window Qt already routes real input
to.

## Files

| File | Role |
|------|------|
| `src/main.rs` | Engine core — geometry, physics/ECS `World`, `Camera`, `wgpu` setup and per-frame render, FFI glue to the C++ shim |
| `src/shader.wgsl` | Single-directional-light flat shading |
| `cpp/shim.h` / `cpp/shim.cpp` | The whole Qt "shell" — window creation, native handle, frame timer, input forwarding |
| `build.rs` | Compiles `cpp/shim.cpp` via `cc`, links the Qt frameworks |
