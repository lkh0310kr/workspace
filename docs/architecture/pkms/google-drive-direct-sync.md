# PKMS Google Drive 직접 동기화

## 명칭

- 기능·저장소 adapter의 표준 명칭은 **PKMS Google Drive**다.
- 구현 디렉터리는 `packages/pkms-google-drive`, npm workspace import는 `@pkms/google-drive`다. 두 이름은 같은 shared package를 가리킨다.
- 모든 신규 코드·문서·설정에서는 **PKMS Google Drive**라는 표준 명칭을 사용한다.

## 목표

PKMS 자료의 durable source of truth를 Google Drive로 옮긴다. 각 client가 OAuth로 사용자의 Drive API를 직접 호출하고, 동기화 요청을 전달하는 PKMS Worker·PKMS Server·Supabase·GitHub 경로를 데이터 경로에서 제거한다. 앱의 정적 파일을 제공하는 hosting은 저장·인증·동기화 요청을 중계하지 않는 한 이 데이터 경로에 포함하지 않는다.

사용자는 연결된 기기에서 같은 파일·폴더를 보고 편집할 수 있다. 연결이 끊겨도 로컬 변경과 outbox는 유지되며, 재연결 후 cloud 변경과 안전하게 수렴한다. 변경 손실을 방지하기 위해 network ACK만으로 로컬 변경을 버리지 않는다.

이 문서는 결과 계약과 안전성에 영향을 주는 Drive protocol을 규정한다. timer, 화면 배치, 내부 class명은 이 계약에 포함하지 않는다.

## 저장소 모델

- 사용자 Drive의 `PKMS` root folder는 PKMS workspace의 durable 저장 영역이다. 첫 연결 시 앱 전용 `appProperties` marker로 기존 root를 조회한다. 0개면 새 `PKMS` root를 만들고, 1개면 사용하며, 2개 이상이면 쓰기를 멈추고 명시적 root 선택을 요구한다. Drive file ID를 local configuration에도 고정하되, 이름 검색 결과만으로 기존 workspace를 자동 선택하거나 새 root를 덮어쓰지 않는다.
- 일반 file과 folder는 Drive `files` resource로 표현한다. `fileId`가 identity이고 `name`과 parent ID가 경로를 결정한다. 빈 folder도 Drive folder entry로 보존한다.
- 동기화 protocol의 append-only 기록은 root 아래 `.pkms-sync` namespace에 저장하고 정상 PKMS Files tree에서 숨긴다. 이 namespace와 그 형식은 프로토콜 소유이며 사용자가 편집하는 문서로 취급하지 않는다.
- 각 operation file의 Drive `appProperties`에는 workspace root, operation ID/type, 영향을 받는 stable item ID, checksum을 둔다. 일반 sync는 IndexedDB에 보존한 Drive change cursor 이후의 operation만 읽는다. 첫 연결은 현재 cursor를 기준점으로 잡고 과거 operation 본문 전체를 재생하지 않는다. Markdown을 열 때는 그 stable file ID로 검색한 seed와 Yjs update만 읽어 해당 문서의 CRDT state를 복원한다.
- Markdown과 binary asset의 사용자가 보는 현재 내용은 root 안의 일반 파일로 제공한다. 검색은 각 client가 내려받은 Markdown과 local index를 사용한다.
- GitHub는 PKMS 저장소/backup 경로에서 제거한다. 기존 GitHub data는 Drive migration을 비교하기 위한 read-only source로만 쓴다. MCP나 제품과 무관한 GitHub 연동은 별도 제품 결정이다.

## 변경과 충돌 보존

Google Drive의 `files.update`를 읽은 version에 대한 원자적 compare-and-swap이라고 가정하지 않는다. 두 기기가 같은 file을 동시에 쓸 때 metadata preflight만으로 lost update를 막을 수 없다. 따라서 이미 발행한 동기화 기록을 in-place 수정·삭제하지 않는다.

각 local mutation은 다음을 갖는 immutable operation으로 먼저 durable outbox에 기록한다.

- protocol version, operation ID, device ID, logical item ID, parent item ID
- operation kind와 이전 operation/base identity
- Markdown은 Yjs update bytes, asset은 content object ID와 SHA-256
- create/rename/move/delete의 target name/path intent

Operation ID는 retry에도 유지된다. Drive upload 응답이 유실되면 Drive에서 같은 operation ID를 확인하고 새 operation을 만들지 않는다. 서버 change feed cursor는 모든 페이지와 변경 적용 결과가 durable local store에 반영된 후에만 전진한다.

Create-folder/file operation은 `appProperties`에 workspace root ID, stable operation ID, stable PKMS item ID, payload SHA-256을 기록한다. create 응답이 유실돼도 같은 marker를 조회해 기존 item을 복구하며, 같은 operation ID가 다른 parent/name/type/content로 재사용되면 충돌로 중단한다. Stable item ID는 생성 직후 Drive가 할당하는 file ID에 종속되지 않으므로, offline에서 이어진 rename/move operation이 여러 기기에서도 같은 item을 가리킨다.

동일 Markdown에 대한 operation은 Yjs update로 merge한다. iOS native Yrs와 JavaScript Yjs는 현재 PKMS protocol의 update bytes를 교환한다. 하나의 merged document는 각 replica에서 materialize한다. content projection의 단일 파일 업로드는 operation log에 이미 보존된 변경의 source of truth가 아니다.

Binary asset은 변경 내용 자체를 merge하지 않는다. 각 version을 immutable object로 보존하고, 같은 base를 수정한 서로 다른 version은 둘 다 유지하며 명시적 conflict item으로 표시한다. Rename·move·delete도 operation history를 보존한다. 동시 경로 충돌이나 delete-vs-edit는 한 항목을 조용히 제거하지 않고 복구 가능한 conflict로 나타낸다.

초기 구현은 operation/version log를 자동 정리하지 않는다. 모든 연결 replica가 확인했다는 안전한 증거와 offline device 만료 정책이 구현되기 전에는 compaction/deletion을 하지 않는다. 사용자가 저장 용량을 줄이고 싶을 때 history를 파괴할 수 있는 동작은 별도 확인과 백업 검증이 필요하다.

## 증분 수렴과 캐시

- 초기 연결은 root metadata와 모든 하위 folder/file metadata를 페이지 단위로 읽는다. 본문 bytes와 과거 operation 내용은 전체 workspace에 대해 선제 다운로드하지 않는다. cache가 있으면 tree와 이미 연 문서 본문을 먼저 보여주고 Drive listing 후 갱신한다.
- Drive `changes.getStartPageToken`과 `changes.list`가 각 client의 durable cursor다. cursor는 마지막 페이지의 `newStartPageToken`이며, 페이지 fetch/application 중 하나라도 실패하면 이전 cursor와 pending operation을 유지한다.
- push notification은 필수 경로가 아니다. 알림을 받으려면 public HTTPS webhook/server가 필요하므로 backend 제거 범위에서는 사용하지 않는다. foreground polling과 재연결 catch-up이 최종 복구 경로다.
- Desktop은 local folder와 durable app state를 사용한다. Web과 Electron renderer는 IndexedDB에 tree, document cache, local search index, outbox, cursor를 저장한다. iOS는 같은 outbox contract를 Application Support와 Keychain adapter로 구현한다. cache는 user-visible content를 잃지 않는 범위에서 replica별로 관리하며 token을 outbox에 저장하지 않는다.
- `synced`는 local durable changes가 Drive에 기록되고 마지막으로 받아 적용한 change cursor까지 처리됐다는 뜻이다. GitHub backup, 다른 client의 현재 실행 상태, 즉시 push notification 수신을 의미하지 않는다.

## 권한과 token 수명

- 첫 전환은 앱이 소유하는 root 및 그 하위 파일만 사용하는 `drive.file` scope를 사용한다. 기존 임의 폴더 전체가 이 scope로 보인다고 가정하지 않는다. 기존 PKMS data migration은 API/Picker 범위가 실제로 허용되는지 확인하며 별도 처리한다.
- 각 플랫폼은 해당 앱 종류에 맞는 public OAuth client ID를 사용한다. Web client ID를 Desktop/iOS에서 재사용하지 않는다.
- Desktop은 Cloud Console에서 `Desktop app` client를 만든다. system browser authorization-code flow에서 PKCE S256, 임의 `state`, loopback listener의 임의 port(`127.0.0.1`)를 사용하고 응답 state·redirect origin·port를 검증한다. Desktop client secret을 비밀로 취급하지 않고 앱에 고정 secret을 넣지 않는다. [Google OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)를 따른다.
- iOS는 bundle ID `com.lkh0310kr.pkms.cloud`에 등록된 `iOS` OAuth client를 사용하고 reversed client-ID URL scheme를 Info.plist에 등록한다. system authentication session을 사용하는 Google Sign-In iOS SDK 또는 AppAuth를 사용하며 WKWebView 안에서 Google consent를 열지 않는다. [Google API access from iOS](https://developers.google.com/identity/sign-in/ios/api-access)와 [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios/start-integrating)를 따른다.
- Native refresh credential은 OS credential store에 두고 renderer/UI layer에 노출하지 않는다. 앱 재시작 후 credential 복구와 revoke/만료 동작은 플랫폼별 acceptance에서 확인한다.
- Web은 Google Identity Services access token을 메모리에서 사용한다. token 만료 후에는 사용자 gesture로 재인증한다. 브라우저가 닫힌 동안 동기화를 보장하지 않고, refresh token을 localStorage/IndexedDB에 저장하지 않는다.
- OAuth client IDs는 플랫폼별 public client 설정이며 secret을 앱에 넣지 않는다. production consent publishing/verification 전에 Test 상태 refresh-token 만료를 production 수명으로 취급하지 않는다.
- 401은 자격 증명 갱신 또는 사용자 재인증 경로다. 403은 권한/정책 오류로 표기한다. 429와 transient 5xx는 jitter를 포함한 capped exponential backoff를 적용하며, permanent 오류를 무한 재요청하지 않는다.

## 이관과 전환

기존 PKMS cloud data는 검증 끝날 때까지 원본으로 보존한다. 첫 Drive 연결이 기존 원본을 수정하지 않는다.

1. 격리된 Drive root에 non-destructive dry run을 실행한다.
2. 재귀 path set, 빈 folder, 파일 수, byte length, SHA-256, Markdown 내용, dotfile 정책을 원본 snapshot과 비교한다.
3. resume·retry·lost upload ACK·동시 문서 변경·asset 충돌·move/delete conflict를 검증한다.
4. 기기별 OAuth, cursor catch-up, offline outbox, 앱 재시작을 확인한다.
5. parity가 완전하고 사용자가 확인한 뒤에만 Drive root를 active workspace로 설정한다. 원본 cloud/GitHub는 rollback 기간 동안 read-only로 둔다.

이관 중 원본과 Drive 양쪽에 쓰는 dual-write는 금지한다. canonical root 변경은 사용자의 명시적 실행과 검증 결과가 필요하다.

## 수락 시나리오

| ID            | 입력·조건                                                       | 기대 결과                                                                                                  |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| DRIVE-SYNC-01 | root 연결, 앱 재실행, 다른 기기에서 동일 계정 연결              | 같은 Drive root ID와 file identity를 복구한다. root 불일치 시 쓰기 전에 멈춘다.                            |
| DRIVE-SYNC-02 | 깊은 tree, 빈 folder, dot-prefix path 및 binary asset           | 새로고침 뒤 tree와 bytes가 보존되고 reserved metadata만 Files tree에서 숨긴다.                             |
| DRIVE-SYNC-03 | Drive offline/429/5xx/401/403, client 종료, 응답 유실           | durable outbox/cursor를 보존하고 bounded retry 또는 재인증 후 중복 없이 이어간다.                          |
| DRIVE-SYNC-04 | change-feed 여러 페이지 중간 fetch 또는 적용 실패               | 일부 변경을 재적용해도 idempotent하며 cursor는 마지막 완료 지점에 남는다.                                  |
| DRIVE-SYNC-05 | 같은 Markdown을 두 기기가 같은 base에서 동시 수정               | 양쪽 Yjs update가 merge되어 두 replica와 Drive projection에서 모두 보존된다.                               |
| DRIVE-SYNC-06 | 같은 asset 동시 수정                                            | 양쪽 bytes가 보존되고 conflict로 표시된다.                                                                 |
| DRIVE-SYNC-07 | rename/move/delete와 편집이 겹치거나 destination collision 발생 | 변경 history와 내용이 유지되고 결과를 모호하지 않게 표시한다.                                              |
| DRIVE-SYNC-08 | 검색어와 Markdown contents가 local cache에 반영                 | 전체 text search가 cache/index에서 작동하며 Drive metadata search만으로 내용을 찾는다고 오해시키지 않는다. |
| DRIVE-SYNC-09 | 기존 PKMS snapshot을 격리 root로 이관                           | recursive path/folder/size/hash 비교가 100% 일치할 때만 parity를 통과시킨다.                               |
| DRIVE-SYNC-10 | browser token 만료, native refresh token 만료/revoke            | 변경을 잃지 않고 재인증 요청을 보여주며 실패 상태를 synced로 표시하지 않는다.                              |
| DRIVE-SYNC-11 | Web 탭 종료/백그라운드, iOS suspension, Desktop 종료            | 각 OS가 약속할 수 있는 foreground/background 경계를 지키고, 재개 시 missed changes를 따라잡는다.           |
| DRIVE-SYNC-12 | Desktop 및 iOS OAuth client 설정, 최초 승인, 앱 재실행           | 각 플랫폼에 등록된 client ID·redirect/bundle ID를 사용하고, token 복구·재인증·revoke가 해당 OS의 secure storage 정책을 지킨다. |

## 릴리스 차단 조건

- 기존 PKMS data의 Drive parity migration 결과가 없거나 Drive 접근 권한이 root 범위를 넘지 못함
- refresh token/client consent 상태가 확인되지 않았거나 secret을 client에 저장함
- 동시에 변경한 두 Markdown update 또는 asset version 중 하나라도 유실됨
- cursor가 미완료 페이지를 건너뛰거나 retry가 중복 item/mutation을 생성함
- 모든 변경·재시작·인증 실패에서 local durable data 보존을 입증하지 못함
- 테스트 원본 및 실제 사용자 root를 구분하지 못하거나 기존 원본을 rollback 가능하게 보존하지 못함

## 현 구현 경계

공통 [PKMS Google Drive package](../../../packages/pkms-google-drive/README.md)는 직접 Drive API client, Drive folder 기반 tree/file repository, IndexedDB outbox/cursor, immutable checksummed operation log, foreground-only Web OAuth adapter, durable incremental change-feed coordinator, file-scoped Yjs history loader 및 create/rename/move/trash용 concrete tree-operation applier를 제공한다. Tree 목록은 metadata를 조회하고 본문은 지연 로드한다. 문서를 열 때는 해당 file ID의 seed와 Yjs updates를 읽어 해당 문서의 CRDT state를 복원하며, 신규 기기 sync는 전체 operation history를 내려받지 않는다. 전체 workspace 본문을 시작 시 일괄 다운로드하거나 인덱싱하지 않는다. Applier는 binary conflict-preserving materialization을 idempotent hooks에 위임한다. Web에는 shared Markdown editor를 재사용하는 별도 `/pkms-google-drive` route가 연결됐다. 이 route는 Drive folder 탐색, Markdown 문서 열기·편집·저장, 기본 create/rename/trash 경로를 제공하지만 기본 PKMS shell을 대체하지 않고, binary 편집·전체 text search·기존 workspace migration은 지원하지 않는다. `PkmsClientApp` 기본 화면, Desktop sync bridge, iOS 저장 provider와 검색 인덱스는 아직 기존 경로에서 Drive로 전환되지 않았다. Desktop/iOS OAuth, 실제 Yjs multi-device convergence 및 production cutover도 완료되지 않았다. 기존 [격리 browser prototype](../workspace/pkms/folder-sync/research/google-drive-direct-sync.md)은 API 가능성 실험으로 유지한다. 진행 상태와 각 단계의 증거는 [PKMS acceptance checklist](./acceptance-checklist.md)에 기록한다.
