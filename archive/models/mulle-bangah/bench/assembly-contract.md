# mulle-bangah assembly contract

## World frame

| Axis | Meaning |
|------|---------|
| +X | Axle (굴통); +X = 방앗간 쪽 (캠·방아) |
| +Y | 방아 긴 팔 / 캠 압력 방향 (pos_x 측) |
| +Z | Up; water enters wheel from +Z (윗걸이) |

Ground: **Z = 0**. Wheel rim bottom at Z = 0 → hub at **Z = WHEEL_OD/2**.

## Part datums (local origin)

| Part | Origin | Notes |
|------|--------|-------|
| `water_wheel` | Hub center | Axle bore along X |
| `axle` | Hub center | ±AXLE_LENGTH/2 along X |
| `press_cam` | Wheel-side hub face | Flush to wheel +X; arm +Y; pad −Z |
| `mill_arm` | Fulcrum foot on floor | Strike −Y, pestle +Y |
| `mortar` | Top opening center | Z=0 opening plane |

## Placement (`lib/layout.py`)

| Instance | World location |
|----------|----------------|
| Wheel + axle | `(0, 0, wheel_hub_z())` |
| Cam +X | Hub face `wheel_pos_x_face_world()` |
| Cam −X | `wheel_neg_x_face_world()`, cam rotated 180° Z |
| Mill pos_x | Fulcrum `mill_fulcrum_world("pos_x")` |
| Mill neg_x | Fulcrum + `Rot(Z=180)` on arm |
| Mortar | `mortar_top_world(side)` under pestle |

## Validation

```bash
npm run agents:cad:assembly-validate -- mulle-bangah
```

## Bench lessons applied

- No `AssemblyHelper` coaxial double-shifts — explicit `layout.*` + `Pos`
- Foot-at-origin on mill_arm and mortar
- `press_cam` hub face at local origin for wheel mating
