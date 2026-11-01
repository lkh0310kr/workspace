# 현재 시스템 아키텍처

아래 문서는 저장소의 현재 Electron 구현을 설명합니다. 코드 경로와 다른 설명을 발견하면 코드에 맞춰 문서를 갱신하세요.

## 읽는 순서

1. [전체 구조](./01-overview.md) — 프로세스, 계층, 데이터 흐름
2. [프로세스와 IPC](./02-process-and-ipc.md) — main, preload, renderer 호출
3. [Workspace와 레이아웃](./03-workspace-and-layout.md) — Workspace·pane 탭과 flexlayout
4. [상호작용 조정기](./04-interaction-coordinator.md) — overlay, 포커스, 브라우저 embed
5. [터미널 파이프라인](./05-terminal-pipeline.md) — PTY, xterm, 출력·스크롤 흐름
6. [브라우저 embed](./06-browser-embeds.md) — webview 수명과 탐색
7. [PKMS 통합](./07-pkms-integration.md) — 공용 클라이언트, pane, Worker IPC 경계

## 범위

- 이 폴더에는 **현재 구현된 시스템**만 둡니다.
- 미래 단계, 목표 모델, 조사 중인 호스팅 구조는 [계획 문서의 공통 기술 방향](../planning/README.md#공통-기술-방향)에 둡니다.
- 기능별 계획은 [계획 문서 색인](../planning/README.md)을 참고하세요.
