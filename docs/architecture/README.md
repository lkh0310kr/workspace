# 시스템 구조

이 문서는 Workspace Electron 앱의 실제 구성과 주요 변경 지점을 설명합니다. 현재 구현을 확인할 때는 각 문서의 코드 경로를 저장소와 대조하세요.

## 읽는 순서

1. [전체 구조](./01-overview.md) — 프로세스, 계층, 데이터 흐름
2. [프로세스와 IPC](./02-process-and-ipc.md) — main, preload, renderer 사이의 호출
3. [Workspace와 레이아웃](./03-workspace-and-layout.md) — Workspace 탭, pane 탭, flexlayout
4. [상호작용 조정기](./04-interaction-coordinator.md) — overlay, 포커스, 브라우저 embed 정책
5. [터미널 파이프라인](./05-terminal-pipeline.md) — PTY, xterm, 출력 전달
6. [브라우저 embed](./06-browser-embeds.md) — webview 수명과 탐색

## 설계 참고 자료

아래 문서는 현재 동작 설명이 아니라 향후 방향이나 설계 원칙을 기록합니다.

- [후속 아키텍처 단계](./07-future-phases.md)
- [컨텍스트 모델링](./08-context-modeling.md)
- [장기 네이티브 아키텍처](./09-future-native-architecture.md)
- [Workspace 핵심 모델](./10-core-model.md)

## 핵심 원칙

- UI가 숨겨져도 터미널 세션과 레이아웃 상태를 보존합니다.
- Workspace 탭과 pane 탭은 전환 시 불필요하게 재생성하지 않습니다.
- 브라우저 embed, overlay, 포커스 상태는 상호작용 조정기를 통해 함께 갱신합니다.
- 프로세스 간 접근은 preload API를 거칩니다.

앱 코드는 `apps/workspace/`에 있습니다. 이 디렉터리의 상대 경로는 저장소 루트 기준입니다.
