# world-engine-core

The real, integrated engine — rendering (`wgpu`), physics (`rapier3d`),
ECS (`hecs`), assembled as a real Rust **library** a game/simulation's
own code links against and drives. Not a hosted third-party engine
(Godot, Blender, etc.), and — as of this crate's own split — not a
JSON-only scene player either: [`world-engine-qt-shell`](../world-engine-qt-shell/)
is one *shell* that renders this into a real native window, but the
engine itself has no Qt/window dependency at all (see the headless
`chase` example below).

> Earlier history: this crate used to be a WebRTC-transport spike,
> superseded by direct native rendering — see the "Transport critique"
> section of
> [`docs/architecture/09-future-native-architecture.md`](../../docs/architecture/09-future-native-architecture.md).
> Its content was fully replaced (not incrementally patched) when it
> became the real shared engine library — see that doc's "Phase 10".

## The SDK surface

`World::spawn`/`spawn_with_behavior` (in [`src/world.rs`](src/world.rs))
is the actual point of this crate — real code hooks into a running
engine here, not just a declarative scene file:

```rust
use world_engine_core::{Behavior, BodyType, EntitySpec, Shape, UpdateCtx, World};

struct MyBehavior;
impl Behavior for MyBehavior {
    fn update(&mut self, ctx: &mut UpdateCtx) {
        // ctx.entity, ctx.dt, ctx.time, and direct rapier3d RigidBody
        // access via ctx.rigid_body — apply forces, set a kinematic
        // target, whatever the game needs.
    }
}

let mut world = World::new_empty();
let entity = world.spawn_with_behavior(
    EntitySpec { position: /* ... */, shape: Shape::Sphere { radius: 0.3 }, body_type: BodyType::Kinematic, ..Default::default() },
    MyBehavior,
);
world.step(); // runs every Behavior, then a real rapier3d physics step
```

`Behavior::update` runs once per `World::step()`, **before** the physics
step — anything it sets on `ctx.rigid_body` (a force, an impulse, a
kinematic target) is consumed by that same step. Deliberately minimal
for this phase: one trait, one way to attach, direct rigid-body access
only — no event bus, no query DSL beyond what `hecs` itself gives you,
no scripting language (Rhai project scripts are a separate JSON-driven
layer — see [`src/script.rs`](src/script.rs) and
[`docs/planning/world-engine-project.md`](../../docs/planning/world-engine-project.md)),
no hot-reload. Real future
scope, not pretended at here.

`World::add_joint`/`add_motion` are smaller convenience methods for two
common cases (a real `rapier3d` joint between two entities; scripted
sinusoidal motion on a kinematic body) that don't need the full
`Behavior` trait.

## JSON scenes are a thin layer on the same API

[`src/scene.rs`](src/scene.rs)'s `world-engine.json` loader
(`load_scene`/`default_scene`/`build_world`) is **one convenience way**
to build a `World` from data — `build_world` is a loop that parses JSON
then calls the exact same `World::spawn`/`add_motion`/`add_joint`
hand-written game code would call. It is not a parallel hardcoded
implementation. See
[`../world-engine-qt-shell/README.md`](../world-engine-qt-shell/README.md#scene-format-world-enginejson)
for the full JSON format (body types, shapes, joints, scripted motion,
glTF mesh loading).

## Rendering

[`src/render.rs`](src/render.rs) — `init_gpu`/`render_frame` build a
`wgpu` surface directly from a native view handle (an `NSView*` on
macOS) and render straight into it every frame: no offscreen texture, no
readback, no video. Nothing here is Qt-specific; any future shell (a
different native toolkit, another platform) can reuse it as-is — the
shell's only job is owning a real native window and handing this crate
its native view handle plus forwarding real input.

## Try it headless

```sh
cargo run --example chase
```

[`examples/chase.rs`](examples/chase.rs) builds a `World` entirely in
code (no JSON, no window) and steps it without any GPU/Qt involved at
all — a `ChaseBehavior` moves a kinematic entity toward a fixed target
every frame via `UpdateCtx::rigid_body`, something the JSON scene
format's sinusoidal-only `motion` field genuinely cannot express. This
is the real proof the SDK API works, not just that the crate split
compiles.

### macOS: `cargo test` doctest SIGKILL

If `rustdoc` is killed during doctests, clear Gatekeeper quarantine on the toolchain:

```sh
./scripts/fix-rust-quarantine.sh
```

## Files

| File | Role |
|------|------|
| `src/world.rs` | ECS/physics `World` — the SDK surface (`EntitySpec`, `Behavior`, `spawn*`, `attach_script`, `add_joint`, `add_motion`) |
| `src/render.rs` | `wgpu` setup, geometry, glTF mesh loading, per-frame render |
| `src/scene.rs` | `world-engine.json` parsing + `build_world` (JSON → `World`, via the same spawn API) |
| `src/script.rs` | Project-local Rhai scripts (`script`/`script_args` in JSON → `World::attach_script`) |
| `src/input.rs` | `InputState`, `input_map`, Rhai `input_axis` / `input_pressed` |
| `src/shader.wgsl` | Single-directional-light flat shading |
| `examples/chase.rs` | Headless proof the code-facing `Behavior` API works |
