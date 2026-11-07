# 네이티브 도구 연동 방향

**상태:** 현재 호스팅 방식을 설명합니다. 실제 기능 범위는 [로드맵](../planning/roadmap.md)과 [기능 상태](../planning/feature-status.md)를 따릅니다.

## 현재 적용 중인 방식

- **웹 번들:** HTML/WASM export가 있는 도구는 `workspace-engine://`로 제공하고 Browser pane에서 엽니다. Godot Web export가 첫 대상입니다.
- **별도 프로세스:** 자체 네이티브 창과 런타임이 필요한 World Engine은 Workspace가 프로세스 수명과 프로젝트 경로를 관리합니다. 실제 지원은 [World Engine 구현 문서](./world-engine/project.md)와 코드가 기준입니다.
- **전문 미리보기:** 파일 미리보기는 Editor의 형식별 renderer 또는 전용 pane으로 엽니다. CAD 편집 커널은 Workspace가 소유하지 않습니다.

## 경계 원칙

- 도메인 엔진은 각자의 모델·렌더링·편집 계약을 소유합니다. Workspace는 파일, 프로젝트, 프로세스 수명, IPC, pane 진입점을 연결합니다.
- 성능이나 플랫폼 제약이 구체화되기 전에는 공통 native-surface 또는 GPU 추상화를 만들지 않습니다.
- 특정 pane의 구현을 시작할 때 해당 엔진의 실제 호스팅 요구와 라이선스를 다시 확인합니다.

## 조사 이력

기존 네이티브 임베딩·픽셀 스트리밍 조사와 당시 가설은 [네이티브 아키텍처 조사 기록](../research/native-architecture-history.md)에 보관합니다.
