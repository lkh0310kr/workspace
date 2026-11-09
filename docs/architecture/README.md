# 시스템 및 제품 아키텍처

아래 문서는 현재 동작과 채택한 제품 경계를 설명합니다. 각 문서에서 목표 구조와 현재 구현을 구분합니다. 코드 경로와 다른 설명을 발견하면 코드에 맞춰 문서를 갱신하세요.

## 읽는 순서

1. [엔지니어링 문서](../engineering/README.md) — 프로세스, IPC, 레이아웃, 상호작용, 터미널
2. [브라우저 embed](./06-browser-embeds.md) — webview 수명과 탐색
3. [PKMS 아키텍처](./pkms/README.md) — 전체 통합 경계와 Desktop 폴더 동기화
4. [제품별 앱 경계](./08-monorepo-module-boundaries.md) — PKMS와 Workspace 앱, 서버, 공유 패키지의 목표 구조와 이전 순서
5. [Desktop 릴리스 원칙](./desktop-release.md) — 활성 플랫폼 우선 검증, 네이티브 패키지 기준, 업데이트 배포


## 범위

- 이 폴더에는 **현재 구현된 시스템**만 둡니다.
- 구현되지 않은 다음 작업은 [백로그](../planning/backlog.md)에서만 관리합니다.
- 기능 구현 여부는 [기능 상태](../planning/feature-status.md)를 참고하세요.
