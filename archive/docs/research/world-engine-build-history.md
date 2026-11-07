# World Engine 구현 이력

2026-08-28부터 2026-09-01까지의 구현·검증 기록입니다. 아래 Phase 번호와 다음 작업은 당시 기록이며, 현재 사양은 [프로젝트 구조](../architecture/world-engine/project.md), [시뮬레이션 계약](../architecture/world-engine/simulation.md), [Rhai API](../architecture/world-engine/rhai-api.md), [오브젝트 모델](../architecture/world-engine/object-model.md)과 코드를 기준으로 확인하세요.

---

### World Engine build-out — Phase 1-4 (2026-08-28)

Concrete phases toward real Electron integration, defined after the user
asked to see this through rather than stop at "designed, not built":

- **Phase 1 — DONE, verified.** `world-engine/qt-shell/`: Qt
  (native, cross-platform UI toolkit — the "정석"/canonical choice for
  Blender/Unity-grade tools, confirmed by researching what Blender/Unity/
  Unreal/DaVinci Resolve actually use, none of them web-based) creates a
  real native window; `wgpu` renders directly into it (no readback, no
  IPC) using the same physics-driven cube as `world-engine-core`
  (`rapier3d` + `hecs`). Standalone process, own top-level window — not
  embedded in Electron yet. Live-verified: a real macOS window with the
  falling/bouncing cube, confirmed on-screen by the user directly (no
  browser client needed this time, unlike the WebRTC-based spikes).
- **Phase 2 — DONE, verified.** `world-engine/embed/`: a
  native Node addon (`napi-rs`), loaded directly into a real Electron
  process (not Qt this time — Qt was for Phase 1's standalone-app
  question; true in-process pane embedding doesn't need Qt's own window
  layer at all). Takes Electron's `getNativeWindowHandle()`, creates our
  own `NSView` (via `objc2`/`objc2-app-kit`) as a subview of Electron's
  content view, and `wgpu` renders directly into it from a dedicated
  render thread — in-process, zero IPC frame transfer, zero video.
  Verified against a real (throwaway, not the Workspace app itself)
  Electron process: the addon loads, embeds, and renders continuously
  with no crash. Reference implementation followed closely (not
  guessed): [monkeynut.org's "Using wgpu with Electron on macOS"](https://www.monkeynut.org/wgpu-electron/),
  which supplied the exact `objc2`/`napi-rs` call shapes used here.
- **Pivot after Phase 2 (2026-08-28): decoupled, not embedded.** Phase 2
  proved true in-process embedding *works*, but its Phase 4 follow-up
  (input forwarding through Electron's transparent web layer into a
  native `NSView` sibling) has no reference implementation anywhere —
  genuinely unsolved, open-ended research risk. Asked directly: "그냥
  일렉트론이랑 앱을 분리할까?" User agreed to decouple rather than absorb
  that risk. World Engine runs as its **own separate native window**,
  which Workspace spawns and manages — the same shape as this app's own
  itch.io-inspired precedent for native content (spawn it, track its
  lifecycle, don't try to visually embed), and the terminal's own
  `Pty`/`PtySession` pattern (main process owns a child process's
  lifecycle) applied to a GUI process instead of a shell. This has **zero
  input-forwarding problem at all** — Phase 1's Qt window already handles
  mouse/keyboard entirely natively, since it's a real, independent native
  window. Phase 2's in-process embedding isn't deleted — kept as a proven,
  documented option to revisit if a genuinely seamless embedded pane
  becomes worth the unsolved input-routing risk later — but it's no
  longer the near-term integration target.
- **Phase 3 — DONE.** Wired into the real Workspace app, matching the
  decoupled shape: `apps/workspace/src/main/worldEngine.ts` spawns/tracks
  `world-engine-qt-shell` as a child process (`launchWorldEngine`/
  `stopWorldEngine`/`worldEngineStatus`, mirroring `pty.ts`'s own
  spawn/dispose shape), disposed on `before-quit` alongside the terminal's
  own cleanup. Triggered via a new "World Engine → Launch World Engine
  (dev)" application-menu item (`index.ts`) — dev-only for now, matching
  `resolveWorldEngineBinary()` pointing at the debug build under
  `world-engine/qt-shell/target/debug/`; packaging the compiled
  binary via `electron-builder` for a real release is real follow-up work,
  not attempted here. `npm run typecheck` and the 250-test suite both
  pass; the binary-path resolution was verified to match the actual built
  artifact's location. **Live click-through confirmed by the user** —
  the app menu item opens a real World Engine window from inside the
  actual running Workspace app.
- **Phase 4 — not needed for the decoupled shape.** Input forwarding was
  only a problem for Phase 2's in-process embedding; a separately-managed
  native window (the shape actually shipped) has no such problem. Stays
  recorded above as a real option if embedding is revisited later, not as
  outstanding work blocking anything today.
- **Phase 5 — DONE: real project integration ("실제 프로젝트 연동").**
  World Engine can now load a real scene instead of always showing the
  same hardcoded demo cube. `world-engine-qt-shell` accepts an optional
  first CLI arg (a project directory) and reads `world-engine.json` from
  it — a deliberately minimal scene format (a flat list of cubes, each an
  independent dynamic rigid body with position/rotation/restitution/
  color; no meshes, no assets, no scripting — real future scope, not this
  pass) parsed with `serde`/`serde_json`. `World` now holds a `Vec` of
  entities instead of one, and `render_frame` draws each with its own
  model matrix and tint (one draw call + submit per entity — simplest
  correct thing at this scale, not a dynamic-offset uniform buffer).
  TreeView gates a new "Open in World Engine" context-menu item on the
  presence of `world-engine.json` in a folder's loaded children — the
  exact same pattern as `project.godot`'s gating for "Export Godot (Web)
  & Open." Wired through `worldEngine:launch` IPC →
  `workspace.launchWorldEngine(tabId, rel)` (resolves through
  `files.resolveUnderRoot`, same confinement every other file op here
  uses) → `worldEngine.ts`'s `launchWorldEngine(projectPath)`, now
  spawning a *new* window per call (tracked in a `Set`, not a single
  slot) since different projects are genuinely different windows.
  Live-verified directly (not just typecheck): built a real 3-cube test
  fixture (`apps/workspace/test-fixtures/world-engine-demo/world-engine.json`,
  different positions/restitution/colors) and ran the binary against it
  standalone — logged "3 entities" loaded, real window, no crash; also
  regression-checked the no-argument path still logs "1 entities" and
  behaves exactly as the original single-cube demo. `npm run typecheck`
  and the 250-test suite pass after the IPC/TreeView/PaneGroup wiring.

Phases 1 and 2 each stayed intentionally scoped to *proving the
mechanism* before either touched `apps/workspace/` — matching this session's
own established pattern (the transport spike, the physics/render spike
before it). Phase 3 is real integration, using Phase 1's artifact (the
Qt window) rather than Phase 2's (the in-process embed) — the safer,
fully-solved path once the two were compared honestly. Phase 5 is the
first real content the integration actually hosts, not just a demo.

### Phase 6 — DONE: real camera input (2026-08-28)

Confirmed feasibility of the fork/spawn pattern for other categories
first: installed real Blender via Homebrew cask and spawned it as a
plain child process (`Blender.app/Contents/MacOS/Blender`, no args) —
a genuine window opened, same as `world-engine-qt-shell`'s own window,
confirming the exact pattern already shipped for World Engine
generalizes directly to real professional GPL tools (Blender/Krita) with
zero new engineering risk. 2D's story is different and simpler still:
Penpot is MIT and already web-based, so it likely fits the
already-solved Track A (web-bundle/Browser-pane) path rather than
needing the fork/spawn pattern at all — not built, just noted as the
right next check whenever 2D is actually picked up.

Then deepened World Engine itself, per the user's own priority. Added
real orbit-camera controls — drag to rotate, scroll to zoom — which
needed no `InteractionCoordinator`-style overlay/pointer-events work at
all, since `world-engine-qt-shell` is a genuine independent native
window: Qt already receives real mouse/wheel events natively.
`cpp/shim.cpp` gained an `EngineWidget` (a plain `QWidget` subclass
overriding `mousePressEvent`/`mouseMoveEvent`/`mouseReleaseEvent`/
`wheelEvent` — overriding existing virtuals needs no `Q_OBJECT`/`moc`,
keeping Phase 1's "no moc" simplicity) forwarding real input events
through a new `InputCallback` in `shim.h`. Rust's `Camera` (yaw/pitch/
distance, orbiting the scene origin) is updated from those events and
used to compute the view matrix every frame instead of a fixed eye
position. Verified: builds clean, runs against the 3-cube test fixture
with no crash. **Confirmed live by the user** — drag orbits, scroll
zooms, inside the actual running window.

### Phase 7 — DONE: ground plane + real glTF mesh loading (2026-08-28)

Two more deepening items, same session: entities had nothing visible to
show what they were physically landing on (the ground collider existed
in `rapier3d` but was never rendered) — added a flat quad matching the
collider's actual size/position (`ground_geometry()`), drawn first each
frame before the entity loop.

Then real mesh loading: an optional top-level `"mesh"` field in
`world-engine.json` (a path relative to the project directory, `.gltf`
or `.glb`) replaces the built-in cube for every entity in that scene.
`load_mesh()` uses the `gltf` crate's standard reader pattern
(`gltf::import` → first mesh → first primitive → `reader.read_positions
()`/`read_normals()`/`read_indices()`) — positions/normals/indices only,
no materials/textures/skinning/animation (real future scope). A missing
or broken mesh reference logs a warning and falls back to the cube
rather than crashing. `GpuContext` was refactored to hold two independent
`Mesh` records (ground, entity) instead of one hardcoded cube buffer, via
a new `upload_mesh()` helper shared by both.

Live-verified directly: built a real two-box test fixture
(`apps/workspace/test-fixtures/world-engine-mesh-demo/`, referencing a real
`.glb` — the official glTF-Sample-Assets "Box" model, a small CC0/public-
domain test asset bundled with the `gltf` crate's own repo) and ran the
binary against it standalone — no fallback-to-cube warning printed
(meaning the real mesh loaded), 2 entities, no crash. Regression-checked
the earlier cube-only scenes (default single-cube demo, the 3-cube
fixture) still behave identically after the `GpuContext` refactor.

Live QA of Phase 7 (user looking at the actual window) caught two real
bugs, both fixed the same session:

- **Ground plane invisible from above**: `ground_geometry()`'s original
  triangle winding produced a normal facing `-Y`, which is front-facing
  (visible, per the render pipeline's `cull_mode: Some(Face::Back)`) only
  from *below* the plane. Diagnosed by hand via the
  `(v1-v0)×(v2-v0)` cross-product for the first triangle, confirmed the
  direction, reversed the index order (`[0,1,2,2,3,0]` →
  `[0,2,1,2,0,3]`), re-verified the new winding's normal points `+Y`.
- **Camera drag direction inverted on a real macOS trackpad**: `yaw -=
  dx * ORBIT_SPEED` felt backwards — dragging right orbited the "wrong"
  way. Flipped to `yaw += dx * ORBIT_SPEED`.

Both were found only by the user actually looking at the running window
— exactly the kind of bug this build-out's "verify at each step, don't
build blind" approach is for.

### Phase 8 — DONE: real rapier3d feature exposure — body types, shapes, mesh-fit colliders (2026-08-28)

`rapier3d` was already a complete physics engine underneath (the same
one Bevy wraps rather than reimplementing), but the scene format only
ever exposed a single dynamic-body, hardcoded-0.5-cuboid slice of it.
This batch exposes three more real capabilities, all backward-compatible
(every existing `world-engine.json` fixture keeps parsing and behaving
identically with zero changes):

- **Body types**: an optional `body_type` field (`"dynamic"` default,
  `"fixed"`, `"kinematic"`) maps directly to `RigidBodyBuilder::dynamic()`
  / `::fixed()` / `::kinematic_position_based()`. Kinematic is a real,
  distinct rapier3d body type — nothing drives its position frame-to-
  frame yet (scripted motion is real future scope), so it currently reads
  as visually identical to fixed.
- **Collider shapes**: an optional `shape` field (`"cuboid"` default with
  `half_extents`, or `"sphere"` with `radius`) maps to
  `ColliderBuilder::cuboid(...)` / `::ball(radius)`, each rendered with
  its own real mesh (`sphere_geometry()` — a small procedural UV sphere,
  LearnOpenGL's standard lat/long formula, deliberately reused rather
  than re-derived by hand after the ground-plane winding bug) instead of
  every shape rendering as a cube regardless of its actual collider.
- **Mesh-derived collider sizing** — the actual bug this batch fixes:
  Phase 7's loaded-mesh entities collided as a hardcoded tiny 0.5 cuboid
  no matter how large the real mesh was. `load_mesh()` now also computes
  the mesh's AABB from its raw vertex positions (min/max per axis) and
  returns it; `main()` passes it through as every entity's real collider
  half-extents when the scene has a top-level `mesh`, ignoring
  per-entity `shape` in that case (documented, not silently wrong).

Implementation note: a `shape` field was first tried as a proper
`#[serde(tag = "shape")]` internally-tagged enum, which is the more
idiomatic serde shape — but that combination doesn't degrade gracefully
when the tag key is entirely absent (every existing fixture has no
`"shape"` key at all; `#[serde(default)]` doesn't rescue it). Caught
during writing, before a build was even attempted — switched to plain
`Option<String>`/`Option<[f32;3]>`/`Option<f32>` fields plus a manual
`resolved_shape()` method that does the defaulting explicitly.

Verified the same way as every other phase: `cargo build` clean, no
warnings. New fixture
`apps/workspace/test-fixtures/world-engine-physics-demo/` (one fixed cuboid,
one dynamic sphere, one kinematic cuboid) run standalone — logs 3
entities, no crash. Regression-ran the three existing fixtures (default
single-cube demo: 1 entity; `world-engine-demo`: 3 entities;
`world-engine-mesh-demo`: 2 entities) — identical counts, no crash, mesh
fixture's collider now sized from the real loaded mesh instead of the
old hardcoded cuboid. Visual confirmation (does the sphere actually
render/bounce as a sphere, does the fixed body stay put, does the
kinematic body stay put) is the user's own live check, same as every
other rendering/physics-feel verification this arc.

### Phase 9 — DONE: real rapier3d joints + scripted kinematic motion (2026-08-28)

Closes the two explicit non-goals Phase 8 called out: joints and driven
kinematic bodies.

- **Joints**: a new top-level `"joints"` list in `world-engine.json`
  connects two entities (by 0-based index into `entities`) with a real
  `rapier3d` constraint — `"revolute"` (hinge, locks all relative motion
  except rotation around one axis — a door hinge/pendulum) and `"fixed"`
  (welds two bodies together, zero relative motion). Both map directly
  to `RevoluteJointBuilder`/`FixedJointBuilder` → `ImpulseJointSet::
  insert()`, which already existed in `World` (`impulse_joint_set` was a
  real field since Phase 1, just never had anything inserted into it).
  An out-of-range `body1`/`body2` index logs a warning and is skipped,
  matching the existing broken-mesh-reference pattern rather than
  crashing.
- **Scripted kinematic motion**: an optional `motion` field on a
  `"kinematic"` entity (`axis`/`amplitude`/`speed`) drives it via a new
  `Motion` ECS component and `World`'s own running clock
  (`time: f32`, advanced once per `step()` by `integration_parameters
  .dt`), calling `set_next_kinematic_translation` before the physics
  step each frame — sinusoidal only (`origin + axis.normalize() *
  amplitude * sin(time * speed)`), not a general animation system.
  Because it's driven through the real rapier3d kinematic-body API
  (not just moving the render transform directly), dynamic bodies
  resting on a moving kinematic platform get pushed by the solver
  correctly, not just visually overlapping it.

`SceneFile.joints` is brand-new data no existing fixture has, so —
unlike `SceneEntityDef`'s `shape` field (see Phase 8's implementation
note) — a plain `#[serde(tag = "type")]` internally-tagged enum works
fine here with no missing-tag problem to work around; there's no old
data for the tag to be missing from.

Verified the same way as every other phase: `cargo build` clean, no
warnings. New fixture
`apps/workspace/test-fixtures/world-engine-joints-demo/` — a revolute-joint
pendulum (fixed anchor + dynamic sphere, offset anchor for a lever arm)
plus a kinematic platform oscillating vertically with a dynamic cuboid
dropped onto it — run standalone: logs 4 entities, no crash, no
out-of-range-joint warning. Regression-ran all four other fixtures
(default single-cube, `world-engine-demo`, `world-engine-mesh-demo`,
`world-engine-physics-demo`) — identical entity counts, no crash.
Visual confirmation (does the pendulum actually swing under gravity
around its hinge, does the platform visibly oscillate, does the dropped
cuboid get carried/pushed by it) is the user's own live check.

### Phase 10 — DONE: engine core extracted as a library + a code-facing SDK API (2026-08-28)

Structural check-in after Phases 1-9: everything built so far was
genuinely a real engine (`wgpu` + `rapier3d` + `hecs`), but the whole
thing lived in one binary (`world-engine-qt-shell/src/main.rs`) driven
entirely by a static `world-engine.json` parsed once at startup and
interpreted by hardcoded rules. That's a JSON scene player, not the
target: a code-first engine SDK (write real Rust code against it to
build a game/simulation, Bevy-flavored) with an editor later as a
*secondary* tool for editing that code's data (closer to Bevy +
inspector than to GDScript-first Godot). Confirmed with the user this
session. Two real gaps, both closed by this phase:

**1. No reusable engine library existed.** `world-engine/core`
was the *old*, explicitly superseded WebRTC-transport spike — it
independently duplicated the same render/physics/ECS code
`world-engine-qt-shell` had, plus a pile of irrelevant deps (`tokio`,
`webrtc`, `warp`, `openh264`, `rtc`). `world-engine-electron-embed`
duplicated it a third time. Fixed by repurposing `world-engine-core`
entirely: its WebRTC-era `src/main.rs` and deps were replaced (not
patched) with the real engine code moved out of
`world-engine-qt-shell`, split into `render.rs` (wgpu, geometry, glTF
loading — genuinely Qt-independent, any future shell can reuse it),
`world.rs` (ECS/physics `World` + the new SDK surface), and `scene.rs`
(the `world-engine.json` loader). `world-engine-qt-shell` now depends on
it as a path dependency and shrank to just the Qt FFI glue + `Camera` +
CLI/project loading — its `Cargo.toml` dropped `wgpu`/`rapier3d`/
`hecs`/`raw-window-handle`/`gltf`/`serde`/`serde_json`/`pollster`/
`anyhow` entirely, down to `world-engine-core` (path dep) + `glam`.

**2. No code-facing hook existed at all.** Every behavior was
declarative JSON interpreted once at load time. Closed with a
**Rust-native trait/callback API** — `Behavior::update(&mut self, ctx:
&mut UpdateCtx)`, Bevy-system-flavored — chosen over embedding a
scripting language (Lua/Rhai/WASM), confirmed with the user: matches
this build-out's established low-risk-first pattern (verify each real
step, don't build the harder/riskier thing first), and a scripting
language can be layered on top of this API later without disturbing it,
whereas building the scripting layer first would be un-doable without
touching everything again. `World::spawn(EntitySpec) -> Entity` is now
the one real entity-creation entry point (both for hand-written game
code and for `scene::build_world`'s JSON loader, which is a thin loop
over the exact same `spawn`/`add_motion`/`add_joint` calls — not a
parallel hardcoded path). `World::spawn_with_behavior` attaches a
`Behavior`, run once per `step()` **before** the physics step (same
ordering scripted kinematic `Motion` already used) so anything it sets
on `ctx.rigid_body` — a force, an impulse, a kinematic target — is
consumed by that same step.

Implementation note: `hecs`'s `Component` bound requires `Send + Sync`
(for its parallel-iteration story), so `Behavior` needed `Send + Sync +
'static`, not just `'static` — found via a real compile error against
`Box<dyn Behavior>` as a component, not guessed at up front.

Verified as the actual point of this phase, not just that the refactor
compiles: `world-engine/core/examples/chase.rs` builds a `World`
**entirely in code** (no JSON, no window, no Qt) and steps it headless —
a `ChaseBehavior` moves a kinematic entity toward a fixed target every
frame via `UpdateCtx::rigid_body`, something the JSON format's
sinusoidal-only `motion` field cannot express. `cargo run --example
chase` prints the chaser's position converging step by step and asserts
it actually reaches the target (distance < 0.1) before printing success
— a real, falsifiable check that the `Behavior` hook drives genuine
rigid-body motion, not a silent no-op. Also: `cargo build` clean, no
warnings, in both crates; regression-ran all five existing
`world-engine-qt-shell` fixtures (default single-cube, `world-engine-
demo`, `world-engine-mesh-demo`, `world-engine-physics-demo`,
`world-engine-joints-demo`) standalone — identical entity counts, no
crash, confirming the split is behaviorally inert for every
JSON-declared scene. Visual re-confirmation in the actual Qt window is
the user's own live check, same as every other rendering/physics-feel
verification this arc.

Deliberately out of scope for this phase (real future work): scripting
language, hot-reload, an event bus, a query DSL beyond what `hecs`
itself gives you, multi-threaded systems, editor UI, save-back-to-JSON,
materials/lighting API, gameplay input routing.

### Phase 11–12 — DONE: project scripts + sim fixtures (2026-09-01)

Rhai per-entity scripts (`script`/`script_args`), `entity_pos`, `entry_script`,
`time_scale`, `script_mode: force`, and multiple `apps/workspace/test-fixtures/world-engine-*-demo/`
projects. See [project structure](../architecture/world-engine/project.md).

Current contracts: [simulation](../architecture/world-engine/simulation.md), [Rhai API](../architecture/world-engine/rhai-api.md), and [object model](../architecture/world-engine/object-model.md).
