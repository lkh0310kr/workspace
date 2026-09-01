# World Engine — Rhai API v1

**Version constant:** `world_engine_core::script::RHAI_API_VERSION` = `"1"`  
**Status:** Frozen at Phase 16 (2026-09-01)

Additive changes only until v2. New functions may be appended; existing signatures must not break.

---

## Entity script

Required:

```rhai
fn on_update(dt, time, x, y, z) {
    return [new_x, new_y, new_z];  // kinematic
    // or [fx, fy, fz] when script_mode is "force"
}
```

Optional:

```rhai
fn on_collision(other_name, started, x, y, z) {
    // started: true = enter, false = exit
}
```

## World script (`entry_script`)

Required:

```rhai
fn on_world_update(dt, time) { }
```

## Built-in functions

| Function | Description |
|----------|-------------|
| `entity_pos(name)` | `[x,y,z]` |
| `entity_x/y/z(name)` | scalar |
| `dist3(x1,y1,z1,x2,y2,z2)` | distance |
| `lerp3(...)` | linear interpolate |
| `input_axis(action)` | `-1..1` |
| `input_pressed(action)` | edge this step |
| `input_down(action)` | held |
| `set_time_scale(s)` | entry_script only |

## Error handling (Phase 16)

- Compile errors: logged at load, entity skipped
- Runtime errors: `eprintln!` + `World::last_script_error()`
- One entity's script error does not stop the simulation step
