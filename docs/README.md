# 문서 안내

Workspace 저장소의 제품 문서와 개발 참고 자료입니다. 현재 앱 동작은 코드가 기준이며, 구현 여부가 불분명한 설계 문서는 문서 안의 상태 표시를 확인하세요.

## 먼저 볼 문서

- [시스템 구조](./architecture/README.md) — 프로세스, IPC, 레이아웃, 브라우저·터미널 구조
- [디자인 원칙](./DESIGN.md) — 시각 스타일과 UI 토큰
- [백로그](./backlog.md) — 진행할 작업과 완료 항목
- [수동 QA 체크리스트](./manual-qa-checklist.md) — 릴리스 전 주요 흐름 점검
- [UI/UX 개선 기록](./ui-ux-improvements.md) — 제품 UI 개선안

## 제품 방향과 계획

- [로드맵](./ROADMAP.md) — 저장소 전반의 단계별 방향
- [아이디어 메모](./ideation.md) — 제품 아이디어와 pane 구상
- [미정 아이디어 백로그](./backlog-ideas.md) — 일정에 아직 포함하지 않은 메모
- [3D 에셋 뷰어 기획](./planning/3d-model-viewer.md)
- [3D 뷰어 확장 아키텍처](./planning/3d-model-viewer-architecture.md)
- [CAD·3D 오케스트레이션 계획](./planning/cad-orchestration-phase-plan.md)
- [하드웨어 시뮬레이션 계획](./planning/hardware-sim-phase-plan.md)
- [시뮬레이션 설계 트랙](./planning/simulation-design-track.md)
- [World Engine 계획](./planning/world-engine-phase-plan.md)

## 기술 참고

- [하드웨어 부품 데이터 출처표](./hardware/component-datasheet-matrix.md)
- [Windows 빌드 안내](./windows-build.md)
- [연구 기록](./research/README.md) — 현재 제품에 포함되지 않은 조사·실험 결과

## 작성 기준

- 앱 코드는 `apps/workspace/`에 있습니다.
- 시스템 구조 문서는 실제 구현 위치와 함께 갱신합니다.
- 계획·아이디어 문서에는 구현 상태를 표시하고, 구현된 내용은 코드와 대조합니다.
- Orca 등 참고 프로젝트는 `ref-proj/`에 보관하며 제품 빌드에는 포함하지 않습니다.
