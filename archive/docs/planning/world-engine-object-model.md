# World Engine — Scene Object Model (Phase 34 + 41)

**Status:** 2026-09-01  
**See also:** [world-engine-project.md](./world-engine-project.md), [world-engine-rhai-api.md](./world-engine-rhai-api.md)

---

## Terminology

| Term | Meaning |
|------|---------|
| `hecs::Entity` | Internal ECS handle (Rust only) |
| **Scene object** | One entry in `entities[]` — a composable object in the world |
| `EntitySpec` | Legacy Rust monolith; still supported, implemented via attach APIs |

---

## Three layers (isomorphic)

```
world-engine.json  ──lower──▶  EntityBlueprint  ──spawn──▶  hecs components
Rust SDK attach_*  ──────────────────────────────────────▶  hecs components
Rhai scripts       ◀── WorldSnapshot (positions, properties, tags)
```

### ECS components (internal)

| Component | Optional | Role |
|-----------|----------|------|
| `Transform` | no | Position / rotation |
| `PhysicsBody` + `PhysicsCollider` | yes | Rapier simulation |
| `Tint` + `RenderMesh` + `RenderScale` | yes | Qt-shell draw list |
| `Properties` | yes | Generic JSON metadata (Phase 34) |
| `PickBounds` | yes | AABB pick without mesh (Phase 41) |
| `EntityTags` | yes | `entity_with_tag` |
| `Motion` | yes | Sinusoidal kinematic drive |
| Rhai `EntityScript` | yes | Stored on `World`, not in ECS |

---

## JSON formats

### Flat (legacy, default)

```json
{
  "name": "walker",
  "position": [0, 0, 0],
  "body_type": "kinematic",
  "shape": "sphere",
  "radius": 0.25,
  "properties": { "breed": "layer" }
}
```

### `body_type: "none"`

Transform + optional `properties` + `pick_half_extents` — no physics, no render mesh.

### Explicit `components[]`

When present, **flat fields on the same object are ignored**.

```json
{
  "name": "zone_marker",
  "components": [
    { "type": "transform", "position": [0, 0, 0] },
    { "type": "properties", "data": { "zone": "management" } },
    { "type": "pick_bounds", "half_extents": [2, 0.1, 2] }
  ]
}
```

Component types: `transform`, `properties`, `physics`, `render`, `script`, `tags`, `motion`, `pick_bounds`.

---

## Rust SDK

```rust
let entity = world.spawn_empty(Some("marker".into()));
world.attach_transform(entity, TransformSpec { position, rotation });
world.set_properties(entity, props);
world.set_pick_bounds(entity, half_extents);

// Or use the scene loader path:
let blueprint = lower_entity_def(&def, mesh_half_extents);
spawn_from_blueprint(&mut world, &blueprint, origin, project_dir);
```

`World::spawn_named(EntitySpec, …)` remains for examples/tests; it calls the same attach path internally.

---

## Rhai (v3 additive)

| API | Scope |
|-----|-------|
| `properties` keys | Injected into **own** entity script scope at load (`script_args` wins on conflict) |
| `entity_property(name, key) -> f64` | Cross-entity numeric read (snapshot) |
| `entity_property_str(name, key) -> String` | Cross-entity string read |

Domain meaning (`breed`, `capacity`, …) lives in project docs/fixtures, not the engine schema.
