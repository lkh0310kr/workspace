# 네이티브 도구 연동 방향

**상태:** 참고 원칙. 현재 작업 순서나 구현 사양이 아닙니다. 실제 기능의 일정은 [개발 로드맵](./roadmap.md)과 도메인별 계획을 따릅니다.

## 현재 적용 중인 방식

- **웹 번들:** HTML/WASM export가 있는 도구는 `workspace-engine://`로 제공하고 Browser pane에서 엽니다. Godot Web export가 첫 대상입니다.
- **별도 프로세스:** 자체 네이티브 창과 런타임이 필요한 World Engine은 Workspace가 프로세스 수명과 프로젝트 경로를 관리합니다. 세부 계획은 [World Engine 단계 계획](./world-engine-phase-plan.md)을 따릅니다.
- **전문 미리보기:** 파일 미리보기는 Editor의 확장자별 렌더러에 둡니다. CAD와 복합 제작 흐름은 [CAD 오케스트레이션 계획](./cad-orchestration-phase-plan.md)에서 다룹니다.

## 경계 원칙

- 도메인 엔진은 각자의 모델·렌더링·편집 계약을 소유합니다. Workspace는 파일, 프로젝트, 프로세스 수명, IPC, pane 진입점을 연결합니다.
- 성능이나 플랫폼 제약이 구체화되기 전에는 공통 native-surface 또는 GPU 추상화를 만들지 않습니다.
- 특정 pane의 구현을 시작할 때 해당 엔진의 실제 호스팅 요구와 라이선스를 다시 확인합니다.

## 조사 이력

기존 네이티브 임베딩·픽셀 스트리밍 조사, 대안 비교, 당시 가설과 결정 과정은 [네이티브 아키텍처 조사 기록](../research/native-architecture-history.md)에 보관합니다. 그 문서는 역사적 참고 자료이며, 이 요약이나 도메인별 계획을 대체하지 않습니다.
