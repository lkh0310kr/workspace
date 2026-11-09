# 시스템 및 제품 아키텍처

아래 문서는 현재 동작과 채택한 제품 경계를 설명합니다. 각 문서에서 목표 구조와 현재 구현을 구분합니다. 코드 경로와 다른 설명을 발견하면 코드에 맞춰 문서를 갱신하세요.

## 읽는 순서

1. [전체 구조](./01-overview.md) — 프로세스, 계층, 데이터 흐름
2. [프로세스와 IPC](./02-process-and-ipc.md) — main, preload, renderer 호출
3. [Workspace와 레이아웃](./03-workspace-and-layout.md) — Workspace·pane 탭과 flexlayout
4. [상호작용 조정기](./04-interaction-coordinator.md) — overlay, 포커스, 브라우저 embed
5. [터미널 파이프라인](./05-terminal-pipeline.md) — PTY, xterm, 출력·스크롤 흐름
6. [브라우저 embed](./06-browser-embeds.md) — webview 수명과 탐색
7. [PKMS 아키텍처](./pkms/README.md) — 전체 통합 경계와 Desktop 폴더 동기화
8. [제품별 앱 경계](./08-monorepo-module-boundaries.md) — PKMS와 Workspace 앱, 서버, 공유 패키지의 목표 구조와 이전 순서


## 범위

- 이 폴더에는 **현재 구현된 시스템**만 둡니다.
- 구현되지 않은 다음 작업은 [백로그](../planning/backlog.md)에서만 관리합니다.
- 기능 구현 여부는 [기능 상태](../planning/feature-status.md)를 참고하세요.
