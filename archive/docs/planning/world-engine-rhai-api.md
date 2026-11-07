# World Engine — Rhai API v3

**Version constant:** `world_engine_core::script::RHAI_API_VERSION` = `"3"`  
**Status:** Phase 31–34, 41 (2026-09-01) — simulation & design track

v2 functions remain. Additive only until v4.

---

## Entity script

```rhai
fn on_update(dt, time, x, y, z) {
    return [x, y, z];           // kinematic position
    return [x, y, z, rx, ry, rz]; // kinematic + euler rotation (radians, YXZ)
    return [fx, fy, fz];        // force or impulse per script_mode
}
```

Optional: `fn on_collision(other_name, started, x, y, z) { }`

## World script (`entry_script`)

Module-level `let` state **persists across frames** (Godot autoload pattern).

```rhai
let stock = 1.0;
fn on_world_update(dt, time) {
    stock -= dt * 0.01;
    set_sim_var("stock", stock);
    publish_metric("stock", stock);
}
```

---

## Built-in functions

### v2 (unchanged)

| Function | Description |
|----------|-------------|
| `entity_pos(name)` | `[x,y,z]` |
| `entity_rot(name)` | `[rx,ry,rz]` euler radians |
| `entity_x/y/z(name)` | scalar position |
| `entity_with_tag(tag)` | first entity name with tag |
| `dist3(...)`, `lerp3(...)` | math |
| `yaw_from_delta(dx, dz)` | atan2 for yaw |
| `input_axis/pressed/down` | input map |
| `set_time_scale(s)` | entry_script |
| `set_camera_target(name)` | entry_script |
| `spawn_prefab(name, x, y, z)` | entry_script |
| `spawn_projectile(x,y,z,vx,vy,vz,lifetime)` | entity or entry |

### v3 — shared simulation state (Phase 31)

| Function | Description |
|----------|-------------|
| `sim_var(name)` | Read f64 from world store (missing → `0.0`) |
| `set_sim_var(name, value)` | Write f64; visible to all scripts next step |

Rust: `World::sim_var`, `World::set_sim_var`, `World::sim_vars()`.

Not stored in `world-engine.json` — runtime only.

### v3 — metrics export (Phase 32)

| Function | Description |
|----------|-------------|
| `publish_metric(name, value)` | Same store as `set_sim_var`; for observation / CI |

Rust: `World::sim_metrics()` → `HashMap<String, f64>` snapshot after `step`.

Shells read metrics; domain key names live in project docs, not the engine schema.

### v3 — deterministic RNG (Phase 33)

| Function | Description |
|----------|-------------|
| `rand()` | Uniform f64 in `[0, 1)` |
| `rand_range(lo, hi)` | Uniform f64 in `[lo, hi)` |

JSON: optional `sim_seed: u64` (default `1`). Rust: `World::sim_seed()`, `World::set_sim_seed(seed)` resets RNG state.

Draw order follows script execution order within each `step` (entry_script first, then entity scripts). Same seed + same `step_n` → reproducible metrics and motion.

### v3 — entity properties (Phase 34)

| Function | Description |
|----------|-------------|
| `entity_property(name, key)` | Read f64 from another entity's `properties` (missing → `0.0`) |
| `entity_property_str(name, key)` | Read string (missing → `""`) |

JSON: `entities[].properties: { ... }` merged into the entity script scope at load (`script_args` overrides).

Rust: `World::set_properties`, `World::named_properties()`.

### v3 — composition (Phase 41)

Scene objects may omit physics (`body_type: "none"`) or declare `components[]`. See [world-engine-object-model.md](./world-engine-object-model.md).

---

## script_mode

| Value | `on_update` return |
|-------|-------------------|
| `kinematic` | position or position+rotation |
| `force` | force vector |
| `impulse` | impulse vector |

---

## Migration v2 → v3

No breaking changes. Projects may adopt `sim_var` / `publish_metric` when cross-script state or headless metrics are needed. Set `sim_seed` when scenarios must replay identically.
