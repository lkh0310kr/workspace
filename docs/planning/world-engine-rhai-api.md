# World Engine — Rhai API v2

**Version constant:** `world_engine_core::script::RHAI_API_VERSION` = `"2"`  
**Status:** Frozen at Phase 30 (2026-09-01)

Additive changes only until v3.

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

```rhai
fn on_world_update(dt, time) { }
```

## Built-in functions (v2)

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

## script_mode

| Value | `on_update` return |
|-------|-------------------|
| `kinematic` | position or position+rotation |
| `force` | force vector |
| `impulse` | impulse vector |
