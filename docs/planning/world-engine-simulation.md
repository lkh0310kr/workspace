# World Engine — Simulation Kernel Contract

**Status:** Lab track foundation (2026-09-01)  
**Audience:** Future you + headless tests. Not a user manual.

North star: personal design/operations lab for physical facilities (coop, waterwheel, farm). Workspace stays loosely coupled.

---

## Layer stack (bottom → top)

| Layer | What | Examples |
|-------|------|----------|
| 0 Object | Transform + optional physics/render/script/properties | Phase 34, 41 |
| 1 Step loop | Fixed tick, ordering, determinism | Phase 31–33 |
| 2 Runtime state | `sim_var`, metrics, RNG stream | Phase 31–32 |
| 3 Snapshot | Serializable continuation state | Phase 38 |
| 4 Query / clock | raycast, pause | Phase 35–36 |
| 5 Data sugar | design overlay | Phase 37 |
| 6 Harness | scenario runner | Phase 39 |

Build **0→3** before harnesses.

---

## One `step()` (invariants)

Fixed dt: `step_dt() = fixed_dt() * time_scale()`. Each call:

1. Advance `sim_time` by `step_dt` (unless paused — Phase 36).
2. Build `WorldSnapshot` (named positions, rotations, tags, properties).
3. `entry_script` `on_world_update` → merge `sim_var` patch.
4. `Motion` kinematic targets (physics bodies only).
5. Entity Rhai `on_update` (physics **or** transform-only).
6. Rust `Behavior` (physics bodies only).
7. Rapier `physics_pipeline.step`.
8. Sync `Transform` from rigid bodies.
9. Collision script callbacks.
10. Projectiles, input `end_frame`.
11. Persist `rng_state` from script thread-local.

**Not in JSON:** `sim_var`, metrics, RNG stream — runtime only.

---

## Object model (Phase 41)

- Every spawned scene object has `Transform`.
- Physics: optional (`BodyType::None` → no `PhysicsBody`).
- Render: optional (`draw_list` skips entities without `RenderMesh`).
- Pick: `RenderScale` half-extents, else `PickBounds`, else default 0.5.
- `properties`: engine-opaque key/value; Rhai scope + `entity_property*`.

Scene data (`world-engine.json`) is not mutated at runtime. `properties` in save files are scene-authoring data, not checkpoint state (Phase 38).

---

## Determinism (Phase 33)

Same `sim_seed` + same `build_world` + same `step_n` → same `sim_metrics` and named positions, **provided**:

- Script load order unchanged (world script, then entities in file order).
- `build_world` syncs RNG after script init (`install_rng_state` → load → `set_rng_state`).

Checkpoint restore must also restore `rng_state` (and `sim_vars`) so **continue stepping** matches uninterrupted run (Phase 38).

---

## `WorldSave` — simulation continuation (Phase 38)

| Field | Purpose |
|-------|---------|
| `sim_time` | Running clock |
| `time_scale` | Unity-style scale |
| `entities[]` | Named transforms + velocities |
| `sim_vars` | Shared f64 store |
| `rng_state` | Rhai `rand()` stream position |
| `sim_seed` | Original seed (informational; stream is `rng_state`) |

**Not saved:** Rhai script locals, `properties`, ECS components without named entity mapping, `paused` flag (Phase 36; not in snapshot yet).

Round-trip: `snapshot` → `restore` preserves `sim_time`, `sim_vars`, `rng_state`, and named transforms. Continuing `step_n(k)` after restore matches uninterrupted baseline for **`rng_state`** (script locals such as `let x = 0.0` in Rhai are not rehydrated — use `sim_var` or entity transforms in save if scripts must resume mid-state).

---

## Tests

| Contract | File |
|----------|------|
| Kernel smoke | `tests/kernel_contract.rs` |
| Save + sim state | `tests/save_contract.rs` |
| Determinism | `tests/determinism_contract.rs` |
| Composition | `tests/composition_contract.rs` |

---

## Non-goals

Multiplayer, PBR, full editor, Blender-grade modeling, commercial game ship, Workspace pane embed, PKMS coupling, domain keys in engine schema.
