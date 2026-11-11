# 시스템 및 제품 아키텍처

이 영역은 전체 시스템 context와 앱/패키지 소유자 링크를 제공합니다. 현재 동작 계약은 app/package 문서를 기준으로 하고, 예정 구조는 planning에 둡니다.

## Global scope

[문서 scope 규칙](../documentation-scopes.md)에 따라 전체 context·제품 경계·상태와 색인을 소유합니다. 앱 내부 계약은 app docs, 공유 동작은 package docs가 기준입니다.

## Global scope

- [문서 scope와 소유 규칙](../documentation-scopes.md)
- [제품 여정](../product/README.md)
- [전체 시스템 context](./01-overview.md)
- [모듈 경계](./08-monorepo-module-boundaries.md)
- [SDD 상태·검사 규칙](./spec-driven-development.md)

## App scope

- [Workspace Desktop](../../apps/workspace-app/docs/README.md)
- [PKMS Web](../../apps/pkms-web/docs/README.md) · [PKMS Server](../../apps/pkms-server/docs/README.md) · [PKMS iOS](../../apps/pkms-ios/docs/README.md)
- [Workspace Home Server](../../apps/workspace-server/docs/README.md)

## Package scope

- [Editor](../../packages/editor/docs/README.md) · [PKMS client](../../packages/pkms-client/docs/README.md)
- [PKMS protocol](../../packages/pkms-protocol/README.md) · [PKMS Core](../../packages/pkms-core/README.md)

## 이전 아키텍처 노트

1. [전체 구조](./01-overview.md) — 프로세스, 계층, 데이터 흐름
2. [프로세스와 IPC](./02-process-and-ipc.md) — main, preload, renderer 호출
3. [Workspace와 레이아웃](./03-workspace-and-layout.md) — Workspace·pane 탭과 flexlayout
4. [상호작용 조정기](./04-interaction-coordinator.md) — overlay, 포커스, 브라우저 embed
5. [터미널 파이프라인](./05-terminal-pipeline.md) — PTY, xterm, 출력·스크롤 흐름
6. [브라우저 embed](./06-browser-embeds.md) — webview 수명과 탐색
7. [PKMS 아키텍처](./pkms/README.md) — 전체 통합 경계와 Desktop 폴더 동기화
8. [모듈 경계](./08-monorepo-module-boundaries.md) — 현재 앱과 패키지 책임
9. [Desktop 릴리스 원칙](./desktop-release.md) — 활성 플랫폼 우선 검증, 네이티브 패키지 기준, 업데이트 배포


## 범위

- 이 폴더에는 **현재 구현된 시스템**만 둡니다.
- 구현되지 않은 다음 작업은 [백로그](../planning/backlog.md)에서만 관리합니다.
- 기능 구현 여부는 [기능 상태](../planning/feature-status.md)를 참고하세요.
