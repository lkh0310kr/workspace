# 현재 앱·패키지 경계

Global scope는 배포·코드 소유·의존 방향을 정의한다. 구체 함수·timer·credential 수명은 소유 모듈 문서를 따른다. 실행 데이터 흐름은 [전체 context](./01-overview.md), scope 판정은 [문서 소유 규칙](../documentation-scopes.md)이다.

## App scope

| 앱               | 현재 책임                                                               | 기준                                                           |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| workspace-app    | Electron OS 권한·pane shell·PTY/files/browser/viewers·Home·PKMS adapter | [Desktop docs](../../apps/workspace-app/docs/README.md)        |
| workspace-server | Home provider API·OAuth·전용 D1·grants                                  | [Home Server docs](../../apps/workspace-server/docs/README.md) |
| pkms-web         | UI·SSR·assets·canonical origin proxy                                    | [Web docs](../../apps/pkms-web/docs/README.md)                 |
| pkms-server      | PKMS auth·account/vault·API/MCP·Supabase/R2·GitHub export               | [Server docs](../../apps/pkms-server/docs/README.md)           |
| pkms-ios         | native UI·Keychain·transport/cache·Realtime·C binding                   | [iOS docs](../../apps/pkms-ios/docs/README.md)                 |

Web/UI Worker와 PKMS API Worker는 서로 다른 실행 단위다. 사용자 canonical origin과 기존 cookie/callback 보존을 위해 server가 page를 Web binding으로 전달한다. Home Server는 PKMS 공용 backend가 아니며 별도 저장·credential 경계다. Desktop·iOS는 같은 PKMS API를 사용해도 자격 증명과 로컬 수명은 공유하지 않는다.

## Package scope

| 패키지        | 현재 책임                                                | 소비자·기준                                                                          |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| editor        | provider 계약·tree·CodeMirror·Markdown·공통 UI           | Desktop, pkms-client; [docs](../../packages/editor/docs/README.md)                   |
| pkms-client   | Web/Desktop 공통 계정·workspace·파일·문서·Realtime/cache | Web, Desktop pane; [docs](../../packages/pkms-client/docs/README.md)                 |
| pkms-protocol | 직접 유지하는 TS DTO·Realtime schema/검사                | client/server와 Swift 모델 대조; [docs](../../packages/pkms-protocol/docs/README.md) |
| pkms-core     | Rust 도메인·Yrs CRDT·FFI/WASM crates                     | 현재 iOS C FFI, binding source; [docs](../../packages/pkms-core/docs/README.md)      |

앱은 package를 import할 수 있고 package는 앱 구현을 import하지 않는다. package의 문서가 소비 앱 source를 **근거로 링크**하는 것과 runtime import 의존 방향을 구분한다. npm workspaces 목록과 Rust workspace, 별도 Desktop native install은 다른 build 경계다.

이전 목표 구조의 workspace-home-protocol은 현재 독립 package로 존재하지 않는다. Home payload는 앱의 실제 DTO/handler에 있으며, 목표 package를 구현된 import API로 사용하지 않는다. 신규 추출 여부는 실제 공유 계약과 검증 요구가 생길 때 별도 작업으로 판단한다.

## 구현·운영 상태

앱 디렉터리 분리와 공유 Editor 연결은 소스에 구현됐다. 남은 작업은 앱 경계를 다시 이름 바꾸는 것이 아니라 제품 acceptance·Home OAuth 설정·sync migration/runtime 검증과 명시된 문서/CI 보강이다. 이전 배포 기록과 이번 source 검토를 혼동하지 않는다. [기능 상태](../planning/feature-status.md)와 [백로그](../planning/backlog.md)가 현재 남은 범위를 관리한다.
