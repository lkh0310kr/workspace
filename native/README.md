# native/

Standalone Rust crates outside `electron/` — not bundled/built by the
Electron app's own tooling (yet; see each crate's own packaging notes).
Full architectural reasoning, research, and decision history lives in
[`docs/architecture/09-future-native-architecture.md`](../docs/architecture/09-future-native-architecture.md)
and [`docs/ROADMAP.md`](../docs/ROADMAP.md)'s World Engine sections — this
file is the practical "what's here and how do I run it" index.

## `world-engine-core/` — **the real, integrated engine — a library**

World Engine itself: a real engine (not a hosted third-party one)
assembled from `wgpu` (GPU rendering) + `rapier3d` (physics) + `hecs`
(ECS), as a real Rust **library** game/simulation code links against and
drives — `World::spawn`/`spawn_with_behavior` is the actual SDK surface,
not just a JSON scene format. See its own README and the architecture
doc's "Phase 10" for the full reasoning and API shape. Try it headless
with no window at all: `cd native/world-engine-core && cargo run
--example chase`.

## `world-engine-qt-shell/` — the native window shell

The Qt shell that renders `world-engine-core` into a real native window
(a plain `QWidget` subclass, no QML, no `moc`) and forwards real input —
no rendering/physics/ECS code of its own. Runs as its own native window,
spawned and managed by the real Workspace app as a child process
(`electron/src/main/worldEngine.ts`, mirroring how `pty.ts` manages a
shell) — not embedded as a pane. See the architecture doc's "World
Engine build-out" section for why (Phase 2's in-process embedding worked
but its input-forwarding follow-up had no solved answer; a
separately-managed native window has no such problem at all, and is
what's actually wired into the app today).

**Build:**

```sh
cd native/world-engine-qt-shell
cargo build
```

Requires Qt 6 (`brew install qt`) — `build.rs` currently hardcodes the
Homebrew macOS install path (`/opt/homebrew/opt/qt/lib`); Linux/Windows
linking is real follow-up work, not done yet.

**Run standalone** (bypasses Workspace entirely — useful for iterating on
the engine itself):

```sh
./target/debug/world-engine-qt-shell                       # default single-cube demo
./target/debug/world-engine-qt-shell /path/to/project/dir  # loads <dir>/world-engine.json instead
```

**Run from Workspace:** the app menu's "World Engine → Launch World
Engine (dev)" item (no project, the default demo), or TreeView's "Open in
World Engine" context-menu item on any folder containing
`world-engine.json` (only offered there, same gating pattern as Godot's
`project.godot` check for "Export Godot (Web) & Open").

**Scene format** (`world-engine.json`, real example at
`electron/test-fixtures/world-engine-demo/`): deliberately minimal — a
flat list of cubes, each an independent dynamic rigid body:

```json
{
  "entities": [
    { "position": [0, 2.5, 0], "rotation": [0.4, 0.6, 0], "restitution": 0.6, "color": [0.9, 0.2, 0.2] }
  ]
}
```

Also supports real `rapier3d` body types/shapes/joints/scripted motion
and glTF mesh loading — see
[`world-engine-qt-shell/README.md`](world-engine-qt-shell/README.md#scene-format-world-enginejson)
for the full format. No materials/textures yet — real future scope.

**Controls:** drag to orbit the camera, scroll to zoom — real Qt mouse/
wheel events forwarded from `cpp/shim.cpp` to Rust (`src/main.rs`'s
`on_input`). No embedding-related input problem exists for this crate at
all, since it's a genuine independent native window.

## `world-engine-electron-embed/` — Phase 2, proven but not the shipped path

A native Node addon (`napi-rs`) that embeds a `wgpu`-rendered `NSView` as
a direct subview of an Electron `BrowserWindow`'s own native view —
true in-process embedding, zero IPC frame transfer. Proved the mechanism
works (verified against a real, throwaway Electron process). **Not wired
into the real Workspace app** — its input-forwarding follow-up (routing
mouse/keyboard through Electron's transparent web layer into the
embedded native view) has no reference implementation anywhere and was a
real open research question, so the team decoupled instead
(`world-engine-qt-shell` above). Kept as a proven, documented option to
revisit if a genuinely seamless embedded pane is ever worth that risk.

```sh
cd native/world-engine-electron-embed
cargo build
# then require() the resulting target/debug/lib*.dylib (renamed .node)
# from an Electron main process and call startEmbeddedEngine(handle, w, h)
# — see the architecture doc for the full call shape.
```

## `engine-stream-poc/` — Track B transport spike, still the right answer for *that* problem

Proves a different, still-valid mechanism: a Rust process streaming
synthetic frames over a real WebRTC connection (`webrtc-rs`) to a
browser-based client, verified with a genuine WebRTC peer (Python's
`aiortc`). This is **not** how World Engine (Workspace's own engine)
talks to the app — see the transport critique above — but it's exactly
the right shape for **Track B**: hosting a genuine third-party or remote
engine that needs to present as "just a URL" the same way Track A's
`workspace-engine://` web-bundle hosting does. Not wired into anything
yet; kept as a verified reference for whenever a real Track B candidate
shows up.

```sh
cd native/engine-stream-poc
cargo build
cargo run
# open static/index.html in a browser (served separately, e.g. `python3 -m http.server`)
```

## Conventions

- Each crate's `target/` is gitignored — never commit build output.
- `Cargo.lock` **is** committed (these are binaries/apps, not libraries —
  standard Rust practice).
- None of these are wired into `electron-builder`'s packaging yet — every
  crate above is dev-only until that's built (a real, separate piece of
  work, not attempted so far).
