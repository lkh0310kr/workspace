# PKMS client 구현 경계

Package scope로 제품 여정 J-06과 J-07의 UI·client orchestration을 소유한다. [PkmsClientApp](../../../../packages/pkms-client/src/PkmsClientApp.tsx)은 조립, features/account·files·editor는 계정/작업/문서 수명, client는 HTTP/cache/operation queue, platform은 Desktop bridge 변환, domain은 순수 file/path/encoding 규칙이다. 공통 UI는 [editor package](../../editor/README.md)를 소비한다.

## Host와 transport

Web host는 React Router와 same-origin fetch 환경을 제공한다. Desktop host는 MemoryRouter·Shadow DOM·별도 React root와 window.pkmsDesktop을 제공한다. [requestPkmsApi](../../../../packages/pkms-client/src/client/api.ts)는 bridge가 있으면 requestDesktopApi, 없으면 fetch(credentials:same-origin)를 사용한다.

Web non-ok는 JSON message/error·X-Request-ID를 Error에 연결하고 body.error를 error.code로 보존한다. 204는 undefined, 나머지는 response.json이다. Desktop 변환은 string body를 JSON, FormData를 multipart parts/bytes로 바꾸고 Main 결과 status/body/requestId를 처리한다. **현재 requestDesktopApi는 method를 POST 또는 GET으로만 변환한다.** 임의 PUT/DELETE를 자동 보존하는 범용 transport로 문서화하지 않는다. header credential 허용은 Main adapter 책임이다.

## 계정과 workspace

[useAccountSession](../../../../packages/pkms-client/src/features/account/useAccountSession.ts)은 user/workspaces/loading/deviceFlow를 소유한다. 초기 /api/session 이후 user가 있으면 workspace 목록을 읽는다. refresh는 현재 workspace ID가 목록에 있으면 최신 레코드로 바꾸고, 없으면 기존 선택을 보존할 수 있으며 초기 선택은 첫 목록이다.

Desktop sign-in은 device start, verification page open, 최소 5초 polling과 expiresAt를 사용한다. mounted=false면 뒤 응답으로 상태를 갱신하지 않는다. pending이면 provider interval을 반영한다. 오류는 error state, 만료는 retry 안내다. Web auth_error/request_id query는 사용자 메시지로 바꾸고 URL에서 replace로 제거한다. clearAccount는 user/workspaces/active selection을 비운다. 실제 token 저장은 이 패키지가 아닌 host/server가 소유한다.

## Tree·queue·document 수명

[workspaceTreeCache](../../../../packages/pkms-client/src/client/workspaceTreeCache.ts)의 IndexedDB는 pkms-workspace-cache v3이며 workspace-trees(workspaceId), workspace-operations(key), workspace-assets(key) store다. open 실패 시 promise를 reset해 이후 재시도가 가능하다. tree 쓰기는 workspace별 promise tail로 직렬화하고 이전 실패 때문에 이후 저장을 막지 않는다. queue entry는 workspace/operation ID·base revision·client ID·payload·queuedAt를 보존하며 read는 workspace filter와 queuedAt 정렬을 수행한다. attachment queue는 Blob을 보관한다.

directory refresh는 해당 direct child 목록을 대체하고 사라진 folder의 후손을 제거하되 다른 branch는 유지한다. 파일 레코드가 같으면 기존 array reference를 반환한다. lazy loadedFolders와 서버 전체 tree를 구분한다.

[useDocumentSession](../../../../packages/pkms-client/src/features/editor/useDocumentSession.ts)은 openSequence와 AbortSignal로 late response를 차단한다. stable editorDocumentKey별 Y.Doc·IndexeddbPersistence를 열고 local persistence sync 후 필요한 서버 state를 seed한다. IndexedDB open 실패 시 원래 문서 DB를 삭제하지 않고 새 로컬 cache 이름으로 전환하며, 이전 DB는 복구 가능성을 위해 보존한다. 새 cache도 열리지 않으면 서버 state로 편집을 계속하고 다음 open에서 재시도한다. server origin update는 사용자 autosave로 되돌리지 않는다. pending remote state를 적용한 뒤 observer/presence/live send를 연결한다. 최근 문서 20개 LRU는 inactive Y.Doc·persistence connection만 닫으며 IndexedDB offline recovery data는 보존한다.

세부 local/Yjs/asset provider의 dirty/save/sync 전이는 [editor sessions](./editor-sessions.md)가 owner다. useDocumentSync와 file operation helper는 durable cloud save·GitHub mirror·operation retry를 조정한다. folder sync는 Desktop bridge가 소유하며 같은 package session 정책으로 합치지 않는다.

## Realtime와 host events

[PKMSRealtimeSocket](../../../../packages/pkms-client/src/realtime.ts)은 WebSocket 형태의 readyState/onopen/onmessage/onclose 인터페이스를 Supabase private channel 위에 제공한다. config/token을 API로 받고 **각 socket 인스턴스가 자체 Supabase client, auth token provider, WebSocket 진단 콜백을 소유한다.** 같은 workspace topic에 여러 PKMS 화면이나 host가 동시에 연결되어도 채널·진단 callback을 공유하지 않는다. protocol broadcast와 presence를 shared DTO로 전달한다. close는 token timer·channel 수명과 이후 callback을 정리한다. 원격 event를 authoritative sync cursor 대신 사용하지 않는다.

공개 host event는 [hostEvents](../../../../packages/pkms-client/src/hostEvents.ts)의 pkms:quick-open이다. Desktop shell이 내부 component 상태를 임의 import해 조작하는 API로 만들지 않는다. 스타일은 package styles.css와 editor CSS를 소비하고 Desktop Shadow DOM 경계를 지킨다.

## 수락·남은 범위

CLIENT-01 Web/desktop transport 선택과 오류 code 보존, CLIENT-02 workspace별 queue identity/retry, CLIENT-03 A 문서 로딩 중 B 선택의 stale 차단, CLIENT-04 server update echo 방지, CLIENT-05 channel removal 후 재접속, CLIENT-06 active cache eviction 제외, CLIENT-07 같은 workspace에 동시 접속한 socket 두 개가 독립적으로 구독·재접속하고 서로의 진단을 덮어쓰지 않는 것이 수락 기준이다.

독립 package test script는 아직 없다. Web typecheck와 Desktop adapter 테스트는 부분 검증이다. 전체 PkmsClientApp UI 분기·file operation 충돌·실제 offline/multi-client acceptance는 후속이다. 이 문서는 UI 대형 component를 리팩터링하기 전에 책임을 고정하는 기준이며 소스 분해를 수행하지 않는다.
