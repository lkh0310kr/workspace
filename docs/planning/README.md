# 계획 문서

이 폴더는 아직 구현되지 않았거나 방향·세부 설계가 바뀔 수 있는 문서의 기준 위치입니다. **구현 상태는 코드와 테스트가 기준**이며, 여기에 적힌 완료 이력은 현재 사양으로 간주하지 않습니다.

## 진행 관리와 제품 방향

| 문서 | 범위 |
|---|---|
| [백로그](./backlog.md) | 현재 처리할 작업 |
| [개발 로드맵](./roadmap.md) | 제품 수준 우선순위와 큰 단계 |
| [제품 방향과 pane 후보](./product-direction.md) | 제품 방향 및 보류 후보 |
| [미편성 아이디어](./uncommitted-ideas.md) | 일정에 넣지 않은 원시 메모 |
| [UI/UX 개선안](./ui-ux-improvements.md) | UX 개선 후보와 완료 기준선 |

## 공통 기술 방향

| 문서 | 범위 |
|---|---|
| [아키텍처 후속 단계](./architecture-phases.md) | 공통 아키텍처의 다음 단계 |
| [모노레포 모듈화 단계 계획](./monorepo-modularization-phase-plan.md) | PKMS·Workspace 통합 구조 개선의 범위, 완료 기준, 단계별 작업 |
| [컨텍스트 모델링](./context-modeling.md) | Domain, Entity, Resource 경계에 대한 참고 모델 |
| [네이티브 아키텍처 방향](./native-architecture.md) | 장기 호스팅 조사와 완료 이력 요약 |
| [Workspace 핵심 모델](./core-model.md) | 목표 primitive와 도입 순서 |

## 도메인별 계획

| 분야 | 기준 계획 | 보조 문서 |
|---|---|---|
| World Engine | [단계 계획](./world-engine-phase-plan.md) — Phase 진행과 우선순위 | [프로젝트 구조](./world-engine-project.md), [시뮬레이션 계약](./world-engine-simulation.md), [Rhai API](./world-engine-rhai-api.md), [오브젝트 모델](./world-engine-object-model.md) |
| CAD·3D | [CAD 오케스트레이션](./cad-orchestration-phase-plan.md) — 실행 단계 | [3D Viewer 기획](./3d-model-viewer.md), [3D Viewer 아키텍처 초안](./3d-model-viewer-architecture.md) |
| 하드웨어 시뮬레이션 | [Phase 60–66](./hardware-sim-phase-plan.md) — 커널·실행 기반 | [Phase 70–78](./hardware-sim-tinkercad-roadmap.md) — 부품 카탈로그·학습 시뮬레이터, [부품 출처표](./hardware-component-catalog.md) |

## 문서 간 역할

- World Engine은 **단계 계획**만 진행 순서의 기준으로 씁니다. 프로젝트 구조 문서는 fixture와 프로젝트 폴더 관례, 시뮬레이션·Rhai·오브젝트 문서는 각각의 계약만 설명합니다.
- 하드웨어 Phase 70–78은 Phase 60–66 기반 이후의 확장 트랙입니다. 두 문서의 phase 번호를 하나의 체크리스트처럼 합치지 않습니다.
- 3D Viewer의 제품 흐름과 범용 import/viewer 설계는 각각 별도 문서입니다. 구현 여부는 계획서가 아니라 코드에서 확인합니다.
- 이 폴더의 초안과 참고 모델은 현재 architecture 설명을 대체하지 않습니다.
