# Workspace Desktop 문서

Desktop 앱의 문서 색인이다. Electron Main/preload/renderer와 앱 adapter의 책임을 구분한다.

| 영역 | 기준 문서 | 소유 책임 |
| --- | --- | --- |
| layout | [Workspace·pane 상태](./layout/README.md) | model·activation·preview·mutation·저장 |
| interaction | [표시·focus·overlay](./interaction/README.md) | guest 입력/표시·portal·drag 정책 |
| runtime | [시작·종료](./runtime/README.md) | Main/renderer 초기화·restore·quit |
| IPC | [Bridge 계약 지도](./ipc/README.md) | invoke/send/event·권한·수명 |
| persistence | [저장과 복구](./persistence/README.md) | layout·terminal·cache·credentials 저장 경계 |
| terminal | [출력·replay·입력](./terminal/README.md) | detached host·sequence·ACK·xterm 수명 |
| editor | [로컬 provider](./editor/providers.md) | filesystem identity·조건부 쓰기·충돌 |
| viewers | [포맷별 pipeline](./viewers/README.md) | media·EPUB·3D·CAD routing와 자원 |
| Home | [기기 정보](./home/README.md) | 기기 summary UI |
| agents | [evidence와 freshness](./agents/README.md) | hook/title·pane identity·rollup |
| settings/usage | [설정과 usage](./settings/README.md) | defaults·theme·zoom·adapter |
| operations | [로그](./operations/logging.md) · [Windows build](./operations/windows-build.md) | 진단·보관·native build 절차 |
| browser | [Browser](./browser/README.md) | guest·viewport·navigation·session·IPC |

공유 [Editor](../editor/README.md), [제품 정의](../../../docs/product/프로젝트%20정의.md), [스펙 운영](../../../docs/architecture/spec-driven-development.md)을 함께 읽는다.

## 재구현 경계

`src/main`은 OS·process·파일·native session의 owner, `src/preload`는 제한된 typed bridge, `src/renderer`는 UI·상태 projection·상호작용의 owner다. `src/shared`는 앱 내부 양쪽 프로세스 계약이며 독립 배포 package와 같지 않다. Desktop의 native dependency 설치는 root npm workspace와 별도로 유지한다.
