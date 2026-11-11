# Workspace Desktop 문서

App scope 기준이다. [전역 제품 여정](../../../docs/product/README.md)의 Desktop 책임을 Electron Main/preload/renderer와 앱 adapter에 배분한다. 공유 editor UI와 PKMS client의 내부 계약은 해당 package 문서가 소유한다.

## 읽는 순서

| 영역 | 기준 문서 | 소유 책임 |
|---|---|---|
| layout | [Workspace·pane 상태](./layout/README.md) | model·activation·preview·mutation·저장 |
| interaction | [표시·focus·overlay](./interaction/README.md) | guest 입력/표시·portal·drag 정책 |
| runtime | [시작·종료](./runtime/README.md) | Main/renderer 초기화·restore·quit |
| IPC | [Bridge 계약 지도](./ipc/README.md) | invoke/send/event·family·권한·수명 |
| persistence | [저장과 복구 inventory](./persistence/README.md) | layout·terminal·cache·credentials 저장 경계 |
| editor adapter | [로컬 provider](./editor/providers.md) | filesystem identity·조건부 쓰기·충돌 |
| browser | [Browser](./browser/README.md) | guest·viewport·navigation·session·IPC |

공유 [Editor](../../../packages/editor/docs/README.md), [PKMS client session](../../../packages/pkms-client/docs/editor-sessions.md), [PKMS 통합 경계](../../../docs/architecture/pkms/overview.md)를 함께 읽는다. 아직 상세 문서가 없는 terminal/viewer/Home/agent/usage의 범위는 [감사](../../../docs/planning/top-down-documentation-audit.md)와 [계획](../../../docs/planning/spec-driven-development-roadmap.md)에서 추적한다.

## 재구현 경계

`src/main`은 OS·process·파일·native session·서비스 token의 owner, `src/preload`는 제한된 typed bridge, `src/renderer`는 UI·상태 projection·상호작용의 owner다. `src/shared`는 앱 내부 양쪽 프로세스 계약이며 독립 배포 package와 같지 않다. root workspace의 package dependency 선언과 Desktop의 별도 native dependency 설치를 함께 유지한다.

앱 진입·build/release 명령은 [앱 README](../README.md), 공통 검증 명령과 남은 native acceptance는 [스펙 운영](../../../docs/architecture/spec-driven-development.md)을 따른다.
