# pottery-wheel — 탁상형 도자기 물레 (CAD 프로젝트)

[`bench-pottery-wheel`](../bench-pottery-wheel)에서 검증한 cadgen / build123d workflow와 **B0–B8 phase plan**으로 제작한 취미용 **물레 방아** CAD 모델입니다.

`bench-pottery-wheel`은 **pipeline**(STEP → viewer, assembly mates, live reload)을 검증했습니다.
이 프로젝트는 해당 패턴을 **제품 목적** 모델에 적용합니다. 명확한 datum, 문서화된 mate, 출력에 적합한 비율을 사용합니다.

---

## 설계 의도

| 항목 | 목표 |
|------|--------|
| Scale | Tabletop / studio hobby (not industrial) |
| Throwing surface | Ø300 mm disc, +Z up |
| Drive | NEMA-17 belt reduction → vertical spindle |
| Fluids | Removable splash pan + drain |
| Origin | Plinth center on XY; plinth top at **Z = 0** |
| Units | mm |

### 좌표 계약 (변경 금지)

| 기준점 | 좌표계 |
|-------|--------|
| Plinth top | Z = 0 |
| Plinth floor / shaft base | Z = −`PLINTH_H` |
| Belt plane | Z = −`PLINTH_H` + 38 (shared by both pulleys) |
| Wheel-head bottom | Z = 0 (bore receives shaft from below) |
| Motor mount foot | Plinth floor at `(0, motor_mount_y(), −PLINTH_H)` |

> Lessons from bench: **no redundant bearing coaxial** on the shaft (geometry already defines the journal).
> Mate splash pan on **`pan_bottom`**, not pan origin. Prefer explicit `Pos` for wheel-head placement until revolute URDF (B5).

---

## 프로젝트 구조 (계획)

```
models/pottery-wheel/
  README.md                 ← 이 문서
  .gitignore
  bench/                    ← per-phase notes + timing (optional)
  src/
    README.md               ← model catalog
    lib/
      __init__.py
      dims.py               ← B7 knobs + all shared constants
      drive_layout.py       ← pulley / belt / mate datums (single source of truth)
    wheel_head.py           ← B0 → B1
    splash_pan.py           ← B2
    plinth.py               ← B3, B8
    shaft.py                ← B3–B4
    motor_mount.py          ← B4
    drive_belt.py           ← B4
    assembly.py             ← root build
  STEP/                     ← generated (commit after each phase milestone)
  DXF/                      ← B6
  URDF/                     ← B5
```

---

## 단계 (bench와 같은 ID, 제품 산출물)

| Phase | 구현 항목 | 상태 |
|-------|--------|--------|
| **P0** | scaffold | ✅ |
| **B0** | `wheel_head` disc | ✅ |
| **B1** | `wheel_head` detail | ✅ |
| **B2** | `splash_pan` | ✅ |
| **B3** | `plinth`, `shaft`, `assembly` | ✅ |
| **B4** | `motor_mount`, `drive_belt` | ✅ |
| B5 | URDF | — |
| B6 | plinth DXF | — |
| **B7** | live reload bench | ✅ |
| B8 | plinth vents | — |

### 권장 구현 순서

```
P0 → B0 → B1 → B2 → B3 → B4 → B7 → (verify in viewer) → B5 → B6 → B8
```

---

## 기본 치수 (시작 값)

bench 기준선에서 가져왔습니다. `src/lib/dims.py`의 **B7 매개변수**에서 조정합니다.

| 그룹 | 키 | 값 (mm) |
|-------|-----|------------|
| Wheel | `WHEEL_D` | 300 |
| | `HEAD_THICKNESS` | 20 |
| Plinth | `PLINTH_D` | 320 (`WHEEL_D + 20`) |
| | `PLINTH_H` | 80 |
| Drive | `DRIVE_PULLEY_OD` / `MOTOR_PULLEY_OD` | 60 / 18 (~3.3:1) |
| Belt plane | offset from plinth floor | +38 |
| Splash pan | `PAN_DEPTH` | 22 |

전체 목록은 P0 구현 후 코드에 반영됩니다.

---

## 빌드 명령

저장소 root에서 실행:

```bash
npm run agents:python:setup
npm run agents:python -- models/pottery-wheel/src/assembly.py
npm run agents:pottery-wheel:bench    # B7: rebuild + timing JSON
```

Live-reload 반복 작업: `bench/B7-live-reload.md`
미리보기: `models/pottery-wheel/STEP/assembly.step`

---

## 벤치마크 기록

| Phase | 빌드 (초) | STEP KB | 변환 (초) | cache hit | viewer 정상 | 메모 |
|-------|-----------|---------|-------------|-----------|-----------|-------|
| B0 | | | | | | |
| B1 | | | | | | |
| B2 | | | | | | |
| B3 | | | | | | |
| B4 | | | | | | |
| B5 | | | | | | |
| B6 | | | | | | |
| B7 | | | | | | |
| B8 | | | | | | |

---

## `bench-pottery-wheel`과의 관계

| | bench-pottery-wheel | pottery-wheel (this) |
|--|---------------------|----------------------|
| 목적 | Pipeline / viewer 부하 테스트 | 제품 형태 assembly |
| Mates | 여러 방식 탐색 (일부는 폐기) | 위 datum 계약으로 문서화 |
| 커밋 | Phase별 벤치마크 | Phase별 **제품** 마일스톤 |
| 재사용 | — | 검증된 `drive_layout` + mate 패턴 이식 |

bench에서 가져올 때 파일을 무작정 복사하지 말고 **패턴**(`drive_layout`, foot datum, belt tangent)을 복사합니다.

---

## 현재 범위 제외

- FEA, motor thermal, exact GT2 belt tooth profile
- Purchased bearing / electronics STEP imports (future **B4+** `purchased/`)
- G-code / print profiles (see `$gcode` / `$dfam-check` later)

---

## 다음 단계 (검증)

1. Workspace에서 `models/pottery-wheel/STEP/assembly.step`을 열어 mate, belt, 공중에 떠 있는 부품이 없는지 확인합니다.
2. B7 반복 작업을 실행합니다. `dims.py`의 `WHEEL_D` 수정 → `npm run agents:pottery-wheel:bench` 실행 → viewer가 다시 로드되는지 확인합니다.
3. 검증 후 **B5** (URDF) 또는 **B6** (DXF)를 진행합니다.
