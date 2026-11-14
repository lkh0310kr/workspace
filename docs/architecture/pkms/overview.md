# PKMS 제품 간 통합 경계

Global scope는 Web/Desktop/iOS와 server·공유 package 사이의 경계만 설명한다. 구체 transport·session·queue 알고리즘은 owner 문서로 내려간다.

## 읽는 경로

| 관심사                                           | 소유 문서                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Web UI·canonical origin·SSR/proxy                | [PKMS Web app](../../../apps/pkms-web/docs/README.md)                          |
| auth/device/MCP·workspace/vault·DB/GitHub export | [PKMS Server app](../../../apps/pkms-server/docs/README.md)                    |
| 공통 계정·파일·cache·Realtime orchestration      | [pkms-client package](../../../packages/pkms-client/docs/README.md)            |
| provider·local/Yjs/asset session                 | [client editor session](../../../packages/pkms-client/docs/editor-sessions.md) |
| 공유 tree·text/Markdown UI                       | [editor package](../../../packages/editor/docs/README.md)                      |
| Desktop pane·native proxy·로컬 folder sync       | [Desktop PKMS app adapter](../../../apps/workspace-app/docs/pkms/README.md)    |
| SwiftUI·Keychain·native transport                | [iOS app](../../../apps/pkms-ios/docs/README.md)                               |
| DTO·Realtime 메시지                              | [protocol package](../../../packages/pkms-protocol/docs/README.md)             |
| UTF-16·CRDT·C ABI                                | [Rust package](../../../packages/pkms-core/docs/README.md)                     |

## 보존할 제품 경계

Web은 browser cookie로 같은 canonical origin의 API를 사용한다. Desktop은 Main이 session token을 보관하고 renderer bridge로 요청한다. iOS는 origin별 Keychain session과 native transport를 사용한다. 서버는 세 플랫폼에 공통 account/workspace 권한과 mutation 의미를 적용한다.

공통 Editor가 저장 정책까지 통합하는 것은 아니다. client package가 Yjs/cache·provider session을 연결하고, Desktop folder 모드는 실제 로컬 파일과 Main sync bridge를 사용한다. durable local save·cloud revision·GitHub mirror는 별도 상태다. Realtime event는 알림·협업 경로이며 folder bridge의 authoritative cursor를 대신하지 않는다.

Home은 PKMS 문서를 저장하는 서비스가 아니다. PKMS는 짧은 Home audience token을 발급하고, Home Server는 별도 grants/저장소를 소유한다. [전체 시스템 context](../01-overview.md)와 [현재 앱·패키지 경계](../08-monorepo-module-boundaries.md)를 함께 읽는다.
