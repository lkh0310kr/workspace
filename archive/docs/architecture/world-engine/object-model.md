# World Engine — 장면 오브젝트 모델 (Phase 34 + 41)

**Status:** 2026-09-01  
**See also:** [프로젝트 구조](./project.md), [Rhai API](./rhai-api.md)

---

## 용어

| 용어 | 의미 |
|------|---------|
| `hecs::Entity` | Internal ECS handle (Rust only) |
| **장면 오브젝트** | `entities[]`의 한 항목으로, 월드 안에서 조합 가능한 오브젝트 |
| `EntitySpec` | 기존 Rust 단일 구조체. 계속 지원하며 attach API를 통해 구현함 |

---

## 세 계층 (동형 구조)

```
world-engine.json  ──lower──▶  EntityBlueprint  ──spawn──▶  hecs components
Rust SDK attach_*  ──────────────────────────────────────▶  hecs components
Rhai scripts       ◀── WorldSnapshot (positions, properties, tags)
```

### ECS 구성 요소 (내부)

| 구성 요소 | 선택 사항 | 역할 |
|-----------|----------|------|
| `Transform` | 아니요 | 위치 및 회전 |
| `PhysicsBody` + `PhysicsCollider` | 예 | Rapier 시뮬레이션 |
| `Tint` + `RenderMesh` + `RenderScale` | 예 | Qt-shell draw list |
| `Properties` | 예 | 일반 JSON 메타데이터 (Phase 34) |
| `PickBounds` | 예 | mesh 없이 AABB로 선택 (Phase 41) |
| `EntityTags` | 예 | `entity_with_tag` |
| `Motion` | 예 | 사인파 형태의 운동학적 구동 |
| Rhai `EntityScript` | 예 | ECS가 아니라 `World`에 저장 |

---

## JSON 형식

### 평면 형식 (기존 형식, 기본값)

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

### 명시적 `components[]`

이 형식이 있으면 같은 오브젝트의 **평면 필드는 무시합니다**.

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

구성 요소 유형: `transform`, `properties`, `physics`, `render`, `script`, `tags`, `motion`, `pick_bounds`.

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

`World::spawn_named(EntitySpec, …)`은 예제와 테스트용으로 계속 제공하며, 내부적으로 같은 attach 경로를 호출합니다.

---

## Rhai (v3 추가 API)

| API | 범위 |
|-----|-------|
| `properties` keys | 로드 시 **해당 엔티티** 스크립트 범위에 주입 (`script_args`와 충돌하면 `script_args` 우선) |
| `entity_property(name, key) -> f64` | snapshot에서 다른 엔티티의 숫자 값을 읽음 |
| `entity_property_str(name, key) -> String` | 다른 엔티티의 문자열 값을 읽음 |

도메인 의미(`breed`, `capacity` 등)는 엔진 스키마가 아니라 프로젝트 문서와 fixture에 둡니다.
