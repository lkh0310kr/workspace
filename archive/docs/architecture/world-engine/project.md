# World Engine 프로젝트와 fixture

이 문서는 프로젝트 디렉터리와 예제 fixture의 관례를 정의합니다. 시뮬 실행 의미는 [시뮬레이션 계약](./simulation.md), 스크립트 함수는 [Rhai API](./rhai-api.md), 장면 오브젝트는 [오브젝트 모델](./object-model.md)을 기준으로 확인하세요. 구현 범위는 [기능 상태표](../../planning/feature-status.md)와 저장소 코드를 확인하세요.

## 소유권 원칙

- 각 시뮬레이션 프로젝트는 장면, Rhai 스크립트, 에셋을 자체 폴더에 둡니다.
- Workspace/Electron은 프로젝트 선택, 파일 탐색, 엔진 실행과 IPC를 담당합니다.
- 도메인별 시뮬레이션 로직은 엔진 코어가 아니라 프로젝트와 fixture에 둡니다.
- 앱 구현 상태는 문서의 완료 표시가 아니라 `world-engine/core/`와 `world-engine/qt-shell/` 코드가 기준입니다.

```text
my-simulation/
  world-engine.json     # 장면과 프로젝트 설정
  scripts/              # 프로젝트 전용 Rhai
    logic.rhai
  assets/               # 선택적 glTF 등
```

## 프로젝트 파일

`world-engine.json`은 프로젝트의 진입 장면과 월드 설정을 담습니다.

| 필드 | 역할 |
|---|---|
| `gravity` | 중력 벡터 `[x, y, z]` (m/s²) |
| `time_scale` | 시뮬레이션 시간 배율 |
| `entry_script` | 월드 Rhai 스크립트 경로 |
| `input_map` | action 이름을 키 또는 축 바인딩에 연결 |
| `entities[]` / `joints[]` | 장면 오브젝트와 조인트 |
| `mesh` | 장면의 기본 glTF mesh |

오브젝트에는 `name`, `script`, `script_args`, `script_mode`, 초기 `velocity` 같은 필드가 쓰입니다. 상세한 script return 계약은 [Rhai API](./rhai-api.md), 물리·저장 의미는 [시뮬레이션 계약](./simulation.md), 구성요소와 장면 직렬화는 [오브젝트 모델](./object-model.md)을 기준으로 합니다.

입력 맵의 기본 형태:

```json
"input_map": {
  "move_x": { "negative": "A", "positive": "D" },
  "jump": "Space"
}
```

## 예제 fixture

새 동작은 엔진 코어에 도메인 코드를 추가하기 전에 독립 fixture나 예제로 증명합니다.

| 예제 | 보여주는 패턴 |
|---|---|
| `world-engine-chase-demo` | `entity_pos`를 이용한 추적 |
| `world-engine-orbit-demo` | 궤도 운동 |
| `world-engine-patrol-demo` | waypoint 순찰과 스크립트 상태 |
| `world-engine-swarm-demo` | Boids-lite 군집 |
| `world-engine-thruster-demo` | 힘 기반 부양 |
| `world-engine-zero-g-demo` | 순수 물리 장면 |
| `world-engine-slowmo-demo` | 월드 스크립트와 시간 배율 |
| `world-engine-drop-demo` | 초기 속도와 포물선 |
| `world-engine-fly-demo` | 입력 맵 이동 |
| `world-engine-physics-demo` | 물체 유형 |
| `world-engine-joints-demo` | 회전 조인트 |

핵심 계약 검증: `cd world-engine/core && cargo test --lib`.
