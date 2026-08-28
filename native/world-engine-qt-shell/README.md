# world-engine-qt-shell

The Qt **shell** for World Engine — a real native window (`cpp/shim.cpp`:
a plain `QWidget` subclass, no QML, no `moc`) that owns the window and
forwards real input, and hands its native view handle to
[`world-engine-core`](../world-engine-core/) to render into every frame.
This crate has no rendering/physics/ECS code of its own any more — that
all moved to `world-engine-core` as a real reusable library (see that
crate's README and `docs/architecture/09-future-native-architecture.md`'s
"Phase 10" for why).

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

A flat list of entities, each a real `rapier3d` rigid body:

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
`rotation` → origin/identity). No materials, no scripting yet — real
future scope, not pretended at here.

Two more fields expose more of the underlying engine, both optional and
backward-compatible (a scene with neither still behaves exactly as
above):

- **`body_type`**: `"dynamic"` (default, falls/collides normally),
  `"fixed"` (never moves — a real `rapier3d` fixed body, not a dynamic
  body pinned in place), or `"kinematic"` (a real, distinct rapier3d body
  type — sits like `fixed` unless it also has a `motion` field, below).
- **`shape`**: `"cuboid"` (default) with `half_extents: [x, y, z]`
  (default `[0.5, 0.5, 0.5]`), or `"sphere"` with `radius` (default
  `0.5`) — a real, distinct `rapier3d` collider shape, rendered as an
  actual procedural sphere mesh, not a cuboid pretending to be one.
- **`motion`**: only meaningful on a `"kinematic"` entity — makes it
  actually move, driven by `set_next_kinematic_translation` every step
  (not just teleported by a script — the physics solver sees it as a
  real kinematic body and dynamic bodies resting on it are pushed
  correctly). Sinusoidal only: `origin + axis.normalize() * amplitude *
  sin(time * speed)`, where `origin` is the entity's own `position`.
  `axis` defaults to `[0, 1, 0]`, `amplitude` to `1.0`, `speed` to `1.0`.
  Not a general animation/scripting system — real future scope.

```json
{ "position": [-2, 1, 0], "body_type": "fixed", "shape": "cuboid", "half_extents": [1, 1, 1] }
{ "position": [0, 6, 0], "body_type": "dynamic", "shape": "sphere", "radius": 0.7, "restitution": 0.7 }
{ "position": [2, 2, 0], "body_type": "kinematic", "shape": "cuboid", "half_extents": [1.5, 0.2, 1.5], "motion": { "axis": [0, 1, 0], "amplitude": 1.5, "speed": 1.0 } }
```

A real example combining all three body types and both shapes lives at
`electron/test-fixtures/world-engine-physics-demo/`.

A top-level `"joints"` list connects two entities (by 0-based index into
`entities`) with a real `rapier3d` constraint the solver enforces every
step — not visual parenting:

- **`"revolute"`**: a hinge — locks all relative motion except rotation
  around `axis` (local-space, shared by both bodies, default
  `[0, 1, 0]`). `anchor1`/`anchor2` are the pivot point in each body's
  own local space — offsetting `anchor2` from a dynamic body's center
  gives it a lever arm to swing on (a pendulum).
- **`"fixed"`**: welds two bodies together at their anchors — zero
  relative motion.

```json
{ "joints": [{ "type": "revolute", "body1": 0, "body2": 1, "axis": [0, 0, 1], "anchor1": [0, 0, 0], "anchor2": [0, 1, 0] }] }
```

An out-of-range `body1`/`body2` index logs a warning and is skipped
rather than crashing the engine (same "broken input degrades, doesn't
crash" pattern as a broken mesh reference). A real example combining a
revolute-joint pendulum with a scripted kinematic platform lives at
`electron/test-fixtures/world-engine-joints-demo/`.

An optional top-level `"mesh"` (a path relative to the project directory,
`.gltf` or `.glb`) replaces the built-in cube for every entity in the
scene — real example at `electron/test-fixtures/world-engine-mesh-demo/`:

```json
{ "mesh": "box.glb", "entities": [{ "position": [0, 3, 0] }] }
```

Only the first primitive of the first mesh is read (positions/normals/
indices — no materials/textures/skinning/animation); a missing or broken
mesh reference logs a warning and falls back to the cube rather than
crashing the engine. The mesh's own bounding box (computed once at load
time) sizes every entity's collider — a loaded mesh no longer collides
as a fixed tiny cuboid regardless of its actual size — so per-entity
`shape`/`half_extents`/`radius` are ignored whenever the scene has a
top-level `mesh`. A flat gray ground plane (matching the physics
ground collider's actual size/position) always renders now too — before
it existed, entities had nothing visible to show what they were falling
onto.

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
| `src/main.rs` | FFI glue to the C++ shim, CLI/project loading, calls into `world_engine_core` for everything engine-side |
| `cpp/shim.h` / `cpp/shim.cpp` | The whole Qt "shell" — window creation, native handle, frame timer, input forwarding |
| `build.rs` | Compiles `cpp/shim.cpp` via `cc`, links the Qt frameworks |

Engine internals (geometry, physics/ECS `World`, `Camera`, `wgpu` setup
and per-frame render, the SDK API) now live in
[`../world-engine-core/`](../world-engine-core/) — see its own README.
