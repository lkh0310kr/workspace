# 개발 로드맵

이 문서는 Workspace의 큰 방향과 우선순위를 안내합니다. 현재 동작과 구현 여부는 코드가 기준이며, 기능별 세부 계획은 연결된 계획 문서를 참고하세요.

## 원칙

- 새 기반 기술을 만들기 전에 실제 오픈소스 프로젝트에서 검증된 구현을 찾습니다. 참고 저장소는 `ref-proj/`에 읽기 전용으로 둡니다.
- 각 pane의 도메인 모델과 엔진은 독립적으로 둡니다. 두 번째 구체 사례가 생기기 전에는 공통 모듈을 추가하지 않습니다.
- 무거운 전문 도구는 직접 다시 만들기보다 실제 앱이나 엔진을 연결하는 방향을 우선합니다.

## Phase 1 — 공통 기반

**완료:**

- 파일 입출력 기능을 `renderer/src/fileSystem.ts`로 분리했습니다.
- 프로젝트 등록 정보를 `shared/projectManifest.ts`와 `main/projectManifest.ts`에서 관리합니다.
- 파일 형식 분류를 `shared/asset.ts`에서 공통으로 처리합니다.
- Godot Web export를 제공하는 `workspace-engine://` 프로토콜을 구현했습니다.

**남은 작업:**

- pane 간 구조화된 복사·붙여넣기를 위한 Clipboard protocol
- pane 명령을 한곳에 등록하는 Command Bus
- 우선순위와 충돌을 다루는 Shortcut Registry
- GPU Service Layer는 두 번째 실제 GPU 사용처가 생긴 뒤 검토합니다.

현재 프로세스·레이아웃 구조는 [시스템 구조 문서](../architecture/README.md), 모델 경계는 [컨텍스트 모델링](./context-modeling.md)을 참고하세요.

## Phase 2 — 전문 제작 도구

목표는 2D, 3D, 영상, CAD·시뮬레이션 도구를 작업 공간 안에서 다루는 것입니다. 각 도구의 엔진과 문서 모델을 하나로 합치지 않습니다.

| 분야 | 현재 방향 | 세부 계획 |
|------|-----------|-----------|
| World Engine | Workspace가 소유한 Rust 기반 엔진을 별도 프로세스로 실행 | [World Engine 단계 계획](./world-engine-phase-plan.md) |
| CAD·3D 오케스트레이션 | 기존 엔진과 라이브러리를 연결하고 Workspace는 실행·파일·뷰를 조정 | [CAD 오케스트레이션 계획](./cad-orchestration-phase-plan.md) |
| 회로·펌웨어 | 하드웨어 전용 커널과 MCU 위임을 분리 | [하드웨어 시뮬레이션 계획](./hardware-sim-phase-plan.md) |
| 2D·영상 편집 | 실제 전문 앱을 평가한 뒤 연결 방식 결정 | [제품 아이디어](./product-direction.md) |

이 분야의 장기 호스팅 조사와 완료 이력은 [네이티브 아키텍처 참고](./native-architecture.md) 및 [로드맵 기록 보관본](../research/roadmap-history.md)에 있습니다.

## World Engine

World Engine은 제3자 엔진을 하나 더 감싸는 pane이 아니라, Workspace가 소유하는 실시간 3D 엔진입니다. 현재 단계와 다음 작업은 [World Engine 계획](./world-engine-phase-plan.md)이 기준입니다. 과거 검증과 실험은 [아키텍처 이력](./native-architecture.md)에서 확인할 수 있습니다.

## 보류 중인 아이디어

Database Studio, Network/Packet Analyzer, GIS, Robot Simulator 같은 분석 도구는 삭제하지 않고 우선순위를 뒤로 둡니다. 후보 목록은 [제품 아이디어](./product-direction.md)에 있습니다.
