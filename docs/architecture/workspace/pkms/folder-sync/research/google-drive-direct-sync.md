# Google Drive 직접 동기화 설계 조사

조사 기준일: 2026-11-15

## 결정 요약

Google Drive를 PKMS 파일의 canonical storage로 쓰는 것은 가능하다. 사용자 한 명과 몇 대의 기기라면 Cloudflare Worker의 파일 API, Supabase 문서 저장, GitHub repository mirror를 동기화 경로에서 제거할 수 있다. 다만 기존 backend를 Drive SDK로 바꾸는 정도의 작업은 아니다. 현재 sync의 revision guard, Yjs 실시간 세션, operation idempotency, durable local queue를 대체하거나 제품 요구에서 제외해야 한다.

권장 방향은 **앱이 소유하는 사용자 표시 Drive 폴더를 만들고, Web과 Desktop이 OAuth로 Drive API에 직접 연결하는 단일 사용자용 sync provider를 먼저 격리된 폴더에서 검증하는 것**이다. 현재 PKMS 데이터는 검증을 끝낼 때까지 수정하지 않는다. Web에 항상 켜진 background sync나 동시 기기 편집이 필수라면 완전한 backend 제거는 요구와 맞지 않는다.

100 GB Google Drive 구독은 파일 저장 용량을 제공한다. Drive API quota, OAuth 권한, 앱 검증을 자동으로 해결하지는 않는다. API의 현재 문서화된 quota는 분당 quota unit 중심이며, 2026년 API 프로젝트 생성 시 적용되는 한도와 무료 사용 범위가 이전 Worker의 일일 요청 한도와 다르다. [Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits)

## 현재 구조와 모듈 경계

- 공용 Editor UI는 [packages/editor](../../../../../../packages/editor/README.md)의 `EditorProvider`를 사용한다. UI를 유지하고 Drive 파일·폴더 작업을 새 provider로 연결할 수 있는 적절한 경계다.
- [createPkmsEditorProvider](../../../../../../packages/pkms-client/src/features/editor/pkmsEditorProvider.ts)는 tree/document를 provider 형태로 감싸지만, open session과 search는 아직 PKMS API/Yjs에 의존한다.
- [pkms-client API](../../../../../../packages/pkms-client/src/client/api.ts)와 [useDocumentSync](../../../../../../packages/pkms-client/src/features/editor/useDocumentSync.ts)는 `/api/workspaces/...` route에 직접 요청한다. 저장은 Yjs update 후 PKMS server에 보내고, GitHub flush 상태를 읽는다.
- [Desktop syncBridge](../../../../../../apps/workspace-app/src/main/pkms/syncBridge.ts)는 PKMS snapshot/change feed, revision cursor, Yjs update, pending operation, Supabase Realtime을 직접 사용한다. 따라서 `EditorProvider`만 바꾸면 Desktop folder sync가 Drive로 이동하지 않는다.
- PKMS Server는 GitHub OAuth·repo, Supabase vault/revision/realtime, R2 asset뿐 아니라 MCP, Home token 등 다른 기능도 함께 제공한다. Drive 전환 뒤에도 남는 기능이 있는지 분리 수용 계획을 세워야 한다. 관련 경계는 [PKMS Server 문서](../../../../pkms/server/README.md)에 있다.

**판정:** Editor와 tree UI 재사용은 쉽다. 데이터/auth/sync provider의 교체는 별도 작업이다. 저장소 추상화가 이미 끝나서 단순 이식이면 되는 상태는 아니다.

## Drive 직접 연결로 얻는 결과

- Markdown, asset, folder를 사용자 My Drive의 일반 폴더에 저장한다. 파일은 Drive 웹 UI와 Finder에서 사용자가 확인할 수 있다.
- Google Drive API의 file ID를 안정적 item ID로 사용한다. 폴더 경로는 parent ID와 이름으로 계산하고, rename/move는 path 문자열 대신 ID를 갱신한다.
- `changes.getStartPageToken`과 `changes.list`를 각 기기별 durable cursor로 사용한다. 마지막 page에 도달한 뒤에만 `newStartPageToken`을 저장한다. `changes.list`의 change는 변경 내용 그 자체가 아니므로 필요한 file metadata/content를 다시 읽는다. [Retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- 변경 알림은 wake-up 용도로만 쓴다. Google `changes.watch`는 HTTPS webhook으로 알림을 보내고 채널이 만료되므로, server를 없애는 구성에서는 사용할 수 없다. Desktop은 poll하고, Web은 탭이 열린 동안 poll해야 한다. [Drive push notifications](https://developers.google.com/workspace/drive/api/guides/push)
- Drive API는 resumable upload와 binary file revision을 지원한다. 하지만 Drive revision history는 PKMS의 revisioned compare-and-swap/CRDT와 동일한 동기화 계약이 아니다. 일반 binary revision은 보통 30일 뒤 삭제 가능하며, 새 revision이 누적되면 더 빨리 정리될 수 있다. `Keep forever`는 파일당 최대 200개이고 storage를 차지한다. 충돌 복사본을 직접 생성해 내용을 보존해야 한다. [Manage revisions](https://developers.google.com/workspace/drive/api/guides/manage-revisions)

## OAuth와 권한

### 저장소 scope

새 Drive 폴더와 그 안의 모든 하위 항목을 앱이 생성하는 모델을 우선한다. 그러면 광범위한 `drive` scope 대신 `drive.file`을 검토할 수 있다. 이 scope는 앱이 생성했거나 사용자가 앱에 명시적으로 열어 준 Drive 파일에 한정된다. `drive`는 전체 사용자 Drive를 읽고 쓸 수 있는 restricted scope이며 공개 앱 검증이 필요하다. Restricted scope 데이터를 server에 저장/전송하면 추가 security assessment 대상이 될 수 있다. [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

기존 Drive 임의 폴더를 통째로 열고 앱 밖에서 추가된 파일도 자동 탐색하는 요구는 `drive.file`만으로 충족된다고 가정하지 않는다. 대상 폴더 선택과 그 하위 항목 접근을 최소 권한으로 허용하는지 실제 OAuth prototype으로 증명해야 한다. 실패하면 새 앱 전용 폴더로 import하거나 restricted `drive` scope 검증을 받아야 한다.

`appDataFolder`는 사용자에게 보이지 않고 다른 Drive 앱과 공유할 수 없다. 따라서 Markdown 본문이나 사용자가 보는 tree를 넣지 않는다. 필요하다면 소규모 앱 설정만 저장한다. [Store application-specific data](https://developers.google.com/workspace/drive/api/guides/appdata)

### Desktop과 Web 세션 차이

- Desktop은 시스템 browser OAuth authorization code + PKCE를 사용한다. 장기 refresh token은 macOS Keychain 등 OS secure storage에 둔다. Client secret을 Electron 앱에 비밀로 넣을 수는 없다. [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- Web이 backend 없이 Drive를 직접 호출하면 Google Identity Services token model의 짧은 access token을 사용한다. 만료 뒤 새 token은 사용자 gesture로 요청해야 한다. 장시간/사용자 부재 중 refresh가 필요한 authorization code flow는 endpoint와 refresh token을 관리할 backend가 필요하다. [Web authorization model](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model), [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- OAuth consent screen이 External/Testing이면 Drive scope를 포함한 refresh token은 7일 후 만료된다. 실사용 Desktop의 무인 background sync 전에 앱 publishing/verification 상태를 해결해야 한다. [OAuth refresh token expiration](https://developers.google.com/identity/protocols/oauth2)
- Browser token은 localStorage에 장기 보관하지 않는다. Web은 현재 탭에서만 token을 memory에 유지하고, 사용자에게 재인증을 요청한다. Desktop refresh token은 OS credential store에 둔다.

## 데이터 및 충돌 정책 초안

| 대상 | Drive 표현 | 적용 규칙 |
|---|---|---|
| Workspace root | My Drive 안의 앱 관리 폴더 | root Drive file ID를 설정에 저장하고, 연결 시 동일 폴더임을 확인한다. |
| Folder | MIME type `application/vnd.google-apps.folder` | parent ID 기반으로 계층을 구성한다. 빈 폴더도 marker로 보존한다. |
| Markdown/asset | Drive binary file | `fileId`가 identity, `parents`와 `name`이 위치다. bytes hash는 로컬 검증에 사용한다. |
| Delete | Drive trash/delete + change feed tombstone | 삭제 의도와 base를 local durable queue에 먼저 기록한다. 애매한 missing/permission loss는 삭제로 간주하지 않는다. |
| Concurrent edit | 별도 Drive revision + conflict copy | 변경 전에 본 remote metadata/content와 다르면 overwrite하지 않는다. 양쪽 내용을 별도 path로 보존하고 사용자에게 attention을 표시한다. |
| Search | device-local content index | Drive metadata search만으로 현재 PKMS의 줄·문맥 검색을 대체하지 않는다. 검색에 필요한 Markdown을 local cache/index에 내려받고 changes feed로 갱신한다. |

Drive API가 노출하는 `headRevisionId`는 blob file의 revision 식별자이며, 문서용 Yjs revision이나 PKMS operation base와 같은 비교 계약으로 취급하지 않는다. 앱 차원의 “읽은 revision과 같은 경우에만 쓰기”가 실제 API에서 원자적으로 보장되는지는 prototype으로 확인한다. 원자적 조건부 write가 없다면 같은 파일을 동시에 수정하는 상황을 완전한 last-write-wins로 처리하지 않는다. 사용자 단독 사용이라도 두 기기가 같은 파일을 편집할 수 있으므로 conflict-copy acceptance가 필수다.

## 100 GB와 API 운영량

- Storage quota와 API quota는 서로 다른 한도다. 100 GB는 Drive가 저장할 수 있는 전체 용량이고, API 요청 수나 분당 처리 quota를 늘리는 설정이 아니다.
- Drive API 문서는 list/change 요청에 quota unit 비용을 적용한다. 현재 문서상 분당 project/user quota는 각각 1,000,000/325,000 units이고, 1 TB/day egress threshold와 400,000,000 quota units/day의 billing threshold가 있다. 2026-05-01 이후 신규 API project에 적용되는 값이며 그 이전에 사용된 project는 기존 값일 수 있다. Cloud Console에서 실제 project 한도를 확인해야 한다. 표준 API 사용은 현재 추가 비용 없이 제공되지만, 초과 사용 과금 안내는 2026년 중 별도 공지 예정이라고 문서화돼 있다. [Drive API limits and pricing status](https://developers.google.com/workspace/drive/api/guides/limits)
- 5초마다 change feed 한 번씩 읽는다면 한 기기에서 분당 12회의 list 요청이다. 문서상 `changes.list`는 100 quota units/request이므로 약 1,200 units/minute다. 즉 무한 재시도는 여전히 방지해야 하지만 현재 Worker Free의 100k/day request cap과 같은 수치/운영 모델은 아니다.
- 5,733개 파일의 최초 content download는 API 호출 수보다 총 bytes, 첫 tree 구축 지연, offline 재시작 시간에 영향을 준다. 초기 sync 후에는 change feed와 변경 파일만 내려받고, 주기적 full scan은 복구 용도로 제한한다.
- HTTP 429와 quota 관련 403은 truncated exponential backoff + jitter 후 재시도한다. 한 요청 실패가 모든 file sync를 막지 않게 path별 pending 상태를 유지한다. [Drive API error handling](https://developers.google.com/workspace/drive/api/guides/handle-errors)

## 권장 목표 구조

```mermaid
flowchart LR
    UI[packages/editor EditorProvider] --> DC[Drive client/provider]
    DC --> WEB[Web: GIS token + IndexedDB cache]
    DC --> DESK[Desktop Main: PKCE + Keychain + durable queue]
    WEB --> API[Google Drive API]
    DESK --> API
    API --> ROOT[사용자 My Drive의 Workspace 폴더]
```

- `packages/editor`는 그대로 두고, Drive item/session/search/mutation을 제공하는 adapter를 둔다.
- Google API REST, MIME/path mapping, change-feed paging, upload/download, retry policy는 재사용 가능한 Drive client module 하나가 소유한다.
- Desktop Main은 access token 갱신, secure credential, local filesystem scan/write, crash-safe queue를 소유한다. renderer에는 refresh token을 보내지 않는다.
- Web은 Google API와 직접 통신하고 IndexedDB에 metadata/body/index를 cache한다. Web 탭을 닫았을 때 background sync를 약속하지 않는다. 다시 열면 cursor부터 catch-up한다.
- 같은 Google OAuth Cloud project 아래 Web/Desktop OAuth client를 나누되, scope는 app-owned folder workflow에서 `drive.file`로 제한한다.
- Yjs WebSocket collaboration과 server GitHub flush는 기본 대상에서 제외한다. 한 기기만 편집한다는 계약이 아니라면 conflict-copy/multi-device behavior를 먼저 구현한다.
- PKMS Web frontend hosting, Workspace Home, MCP, PKMS authentication은 file sync와 별도 migration 항목이다. Drive를 canonical storage로 바꾼다고 기존 Worker/Server process 전체가 자동 제거되지는 않는다. Web UI를 계속 제공하려면 정적 frontend hosting은 별도로 필요하다.

## 대안 평가

| 선택지 | 장점 | 제약 | 판단 |
|---|---|---|---|
| Drive API를 각 client에서 직접 호출 | 별도 파일 backend가 없고 Google Drive에서 데이터를 확인할 수 있다. 현재 EditorProvider를 재사용한다. | Web refresh-token/background 한계, 직접 auth, conflict/cursor/queue 구현 필요. | 권장 prototype 대상 |
| Google Drive for desktop의 mirror 폴더를 Desktop Editor가 사용 | Desktop은 Drive API auth·sync 엔진을 직접 구현하지 않아도 local files에 접근한다. | Drive client와 Workspace가 두 개의 sync owner가 되기 쉽다. Web API와의 conflict, macOS File Provider placeholder/다운로드 시점 문제를 수락해야 한다. | 비교 fixture로만 검토; production 기본안으로 선택하지 않음 |
| 기존 Worker/PKMS Server 유지 | 현재 Yjs/revision/auth/queue를 활용한다. | 지금의 Cloud request/운영 비용 문제를 유지한다. | 사용자 목표에 맞지 않음 |

Google Drive for desktop은 macOS 12.1+ stream mode에서 Apple File Provider를 사용하며 mirror/stream 차이가 있다. 앱이 관리하는 watcher·queue와 동시에 sync engine으로 쓰면 파일의 로컬 materialization/수정 순서가 두 시스템에 나뉠 수 있다. [Drive for desktop on macOS](https://support.google.com/drive/answer/12178485)

## 단계별 조사·전환 게이트

1. **OAuth/API prototype:** app-owned test folder를 만들고 `drive.file`만 승인한다. Web에서 folder tree/list/create/rename/move/delete/upload/download, Desktop에서 PKCE/Keychain refresh, `changes.list` paging/cursor, 401/403/429 handling을 검증한다. 대상 folder의 하위 app-created item 접근도 명시적으로 증명한다.
2. **Durability/concurrency prototype:** 두 client에서 동일 파일 수정, upload 응답 유실, delete-vs-edit, rename 충돌, 앱 종료 각 경계를 재현한다. 두 내용 모두 보존되고 retry 뒤 중복 file이 생기지 않는지 확인한다. 조건부 write API semantics를 확정한다.
3. **Scale/recovery:** 5,733개 수준의 tree와 현재 asset volume을 test Drive folder에 복제한다. 첫 open latency, full download bytes, incremental poll quota, offline 기간 후 catch-up, content index 준비 시간을 측정한다.
4. **Non-destructive migration dry run:** PKMS source를 읽기 전용으로 snapshot하고 새 Drive root에 복제한다. file path set, empty folders, SHA-256, attachment bytes를 재귀 비교한다. 두 경로의 수량/hash가 일치하기 전까지 새 Drive root를 production editor에 연결하지 않는다.
5. **Cutover:** maintenance window에 새 쓰기를 잠시 멈추고 final delta를 반영한 뒤, Drive root를 canonical로 지정한다. 기존 PKMS Cloud/GitHub는 검증 완료 전까지 read-only rollback source로 둔다. data path에서 제거된 서비스와 Home/MCP/frontend에 남은 의존을 별도 확인한다.

### 완료 기준

- Worker/PKMS Server/GitHub 데이터 경로 없이 Web과 Desktop이 같은 Drive file ID/content로 수렴한다.
- Web은 token 만료와 offline 후 복구 가능한 UX를 제공하고, backend 없는 상태에서 탭 종료 중 sync된다고 잘못 표시하지 않는다.
- change feed pagination, cursor commit, root rename/move/delete, empty folder, assets, retry/lost ACK, 429, auth revoke, app restart에서 데이터 손실/조용한 overwrite가 없다.
- 파일 단위 동시 수정에서 두 버전이 복구 가능하고 conflict를 사용자가 검토할 수 있다.
- 전체 file path set, folder path set, byte length/hash가 source snapshot과 일치한다.
- OAuth app publishing/verification과 실제 Google Cloud project quota/cost 상태가 준비돼 있다.

## 출처

- Google Drive API: [Choose scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Changes](https://developers.google.com/workspace/drive/api/guides/manage-changes), [Push notifications](https://developers.google.com/workspace/drive/api/guides/push), [Limits](https://developers.google.com/workspace/drive/api/guides/limits), [Handle errors](https://developers.google.com/workspace/drive/api/guides/handle-errors), [Manage revisions](https://developers.google.com/workspace/drive/api/guides/manage-revisions)
- Google Identity: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Web authorization model](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model), [Token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [OAuth token lifecycle](https://developers.google.com/identity/protocols/oauth2)
- Google Drive Help: [Drive for desktop on macOS](https://support.google.com/drive/answer/12178485)
