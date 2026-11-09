# 엔지니어링 문서

Workspace 데스크톱 앱의 내부 구현 구조를 설명합니다. 제품·서비스의 전체 경계와 PKMS 동기화 구조는 [시스템 아키텍처](../architecture/README.md)에 있습니다.

## 읽는 순서

1. [전체 구조](./01-overview.md) — 프로세스, 계층, 데이터 흐름
2. [프로세스와 IPC](./02-process-and-ipc.md) — main, preload, renderer 호출
3. [Workspace와 레이아웃](./03-workspace-and-layout.md) — Workspace·pane 탭과 flexlayout
4. [상호작용 조정기](./04-interaction-coordinator.md) — overlay, 포커스, 브라우저 embed
5. [터미널 파이프라인](./05-terminal-pipeline.md) — PTY, xterm, 출력·스크롤 흐름

구현과 문서가 다르면 현재 코드를 기준으로 이 문서를 갱신합니다.
