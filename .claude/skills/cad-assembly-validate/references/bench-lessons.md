# 어셈블리 벤치 교훈 (pottery-wheel / bench-pottery-wheel)

## 실패 사례

| 실수 | 증상 | 수정 방법 |
|---------|---------|-----|
| Bearing `coaxial` + shaft base mate | Shaft shifted −80 mm | Remove redundant coaxial; one mate per DOF |
| Splash pan at origin | Pan inside plinth | Mate `pan_bottom` at `Z = -PAN_DEPTH` |
| Motor mount with double Y offset | Motor floating | Foot at `(0,0,0)` after `Pos(0, motor_y, z)` reorigin |
| Wheel head revolute at shaft base | Head at Z≈68 | Explicit `Pos(0,0,0)` on plinth top |
| Belt in wrong plane | Disconnected straps | Centralize pulley layout in `drive_layout.py` |

## 잘 작동하는 패턴

1. **`lib/layout.py`** (또는 `drive_layout.py`) — 모든 월드 좌표는 `dims.py`를 바탕으로 계산합니다.
2. **장착 위치에 파트 기준점 설정** — `foot`, `base`, `hub`, `pan_bottom`을 로컬 원점에 둡니다.
3. 프레임을 신뢰할 수 있으면 동축 및 면 대 면 배치에 **`AssemblyHelper`**를 사용합니다.
4. 헬퍼로 배치하기 어려우면 **`bd.Pos(layout.*) * part()`**를 사용합니다.
5. validate와 interfere를 통과한 뒤 **단계별로 STEP을 커밋**합니다.

## 검증 순서

1. 어셈블리 다시 빌드
2. `step inspect validate`
3. `step inspect interfere`
4. 프로젝트 `assembly_validate.py` (중심점, 간격)
5. 아직 검사 코드에 반영되지 않은 간격을 뷰어에서 확인
