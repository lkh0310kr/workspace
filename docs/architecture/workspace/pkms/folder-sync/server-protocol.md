# PKMS folder sync server protocol

이 문서는 Desktop bridge와 workspace API 사이의 상호운용 계약이다. path, revision, operation identity가 다르면 sync 결과가 달라지므로 구현 독립적인 상세 계약으로 취급한다. Worker route는 workspace membership/auth를 확인한 뒤 `SupabaseVault`에 전달한다.

## 공통 식별자와 revision

- 모든 요청은 `/api/workspaces/{workspaceId}/...` 아래이며 Desktop Main의 PKMS session proxy를 통한다. renderer에 access token을 전달하지 않는다.
- `fileId`는 workspace 안 item identity, `path`는 relative logical path, `revision`은 workspace mutation revision이다. client tree version, local cache version, content hash는 서로 바꿔 쓰지 않는다.
- `baseRevision`은 작업자가 읽은 workspace metadata cursor다. 서버가 허용하는 stale-base rebase와 item-specific guard는 operation type별로 다르다.
- `operationId`는 UUID idempotency key다. 성공 결과가 `pkms_operations`에 남으며 같은 workspace/key의 재요청은 저장된 결과에 `duplicate: true`를 더해 돌려준다.
- 같은 경로 create/move 충돌은 server가 conflict path를 발급할 수 있다. client는 요청 path를 성공 path라고 가정하지 않고 response path를 사용한다.

## Snapshot / metadata feed

| Request                                                      | 응답·의미                                                                                                                                     | 제한/오류                                                                                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /sync/tree?atRevision=&afterPath=`                      | `{workspaceId, revision, files, hasMore, nextPath}`. markdown+folder metadata를 `path` 오름차순으로 한 revision snapshot에서 반환. 본문 없음. | `atRevision`은 safe integer, 0 이상 현재 server revision 이하. page는 최대 1000 rows. 잘못된 cursor는 400 `invalid_snapshot_cursor`.                                                |
| `GET /snapshot?atRevision=&afterPath=`                       | legacy markdown-only metadata snapshot. legacy client 호환용.                                                                                 | 1000 rows/page. Desktop은 `/sync/tree` 404일 때만 legacy fallback을 사용하며 empty folders는 path에서 추론할 수 없음.                                                               |
| `GET /sync/changes?afterRevision=&lastRevision=&lastFileId=` | `{changes, hasMore, nextRevision, lastRevision, lastFileId}`. item metadata와 `previousPath`, tombstone `deleted` 포함.                       | page 최대 500. 안정 순서는 `(revision,file_id)`. 다음 page는 `afterRevision`을 유지하고 `lastRevision/lastFileId`를 이어 cursor로 보낸다. 잘못된 tuple은 400 `invalid_sync_cursor`. |
| `POST /sync/download` `{fileIds: string[]}`                  | `{documents:[{id,path,revision,text? ,error?}]}`. Markdown bodies를 batch로 반환.                                                             | Desktop은 batch당 32개. 누락 row도 stale manifest로 취급. file 크기 제한 초과는 item error `file_too_large`; MAX_MARKDOWN_BYTES=512 KiB.                                            |

`sync/changes.nextRevision`은 완전히 소진된 page에서만 server의 captured current revision으로 전진한다. 중간 page는 `afterRevision`을 유지하고 tuple cursor로 같은 revision의 나머지를 이어 읽는다. 소비자는 마지막 page 이후만 durable cursor로 커밋한다.

Web Files tree는 `/directory?path=`를 사용해 현재 열려 있거나 확장된 directory listing을 갱신한다. 이 응답은 즉시 자식인 Markdown, asset, folder를 포함한다. `/snapshot`은 Markdown-only 문서 metadata 용도이므로 그 응답으로 Files tree 전체를 교체하면 안 된다. realtime mutation 뒤에는 loaded directory listing을 다시 가져와야 folder marker와 asset row가 유지된다.

## Mutation contract

`POST /operations` outer body:

```json
{
  "operationId": "uuid",
  "baseRevision": 123,
  "clientId": "desktop-sync-bridge",
  "operation": { "type": "..." }
}
```

| Operation       | operation body                                                           | 성공 의미                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-file`   | `{type,path,fileId,content}` + `initialState` (base64 Yjs initial state) | 파일과 문서 초기 상태를 mutation 하나로 만들고 `{file?,fileId?,path?,acceptedRevision,conflictCopyPath?}` 반환. create 경로 충돌은 보존용 conflict path로 수락될 수 있음.                                                                                                                            |
| `create-folder` | `{type,path}`                                                            | folder metadata와 부모 path를 보장하고 accepted revision을 반환한다. 같은 path에 active folder가 있으면 no-op이다. folder row만 없고 descendant row가 있으면 conflict path를 만들지 않고 marker/directory row를 복구한다. 정확한 path에 non-folder item이 있으면 기존 conflict 보존 정책을 적용한다. |
| `move`          | `{type,fileId,toPath}`                                                   | file 또는 subtree를 이동. path collision은 conflict copy path가 될 수 있음. folder 자신의 하위로 move는 거부.                                                                                                                                                                                        |
| `delete` file   | `{type,fileId,expectedRevision}`                                         | item revision이 예상값과 같을 때 tombstone. mismatch는 409 `file_changed_since_base`.                                                                                                                                                                                                                |
| `delete` folder | `{type,fileId,protectSubtree:true}`                                      | subtree를 하나의 조건부 transaction으로 tombstone. 현재 guard는 workspace revision이 `baseRevision`과 같아야 하므로 subtree 밖 변경도 409 `folder_changed_since_base`를 일으킬 수 있음.                                                                                                              |

성공 결과는 `operationId`, `acceptedRevision`, `duplicate`; 선택적으로 `conflictCopyPath`, `rebasedFrom`을 포함한다. 기존 operation key의 payload까지 비교해 다르면 거부하는지 등 operation ledger의 전체 오용 조건은 DB migration/RPC와 함께 유지해야 한다. 클라이언트는 같은 key에는 같은 payload를 재사용한다.

## Yjs document read/write

- `GET /files/{fileId}/updates`는 Yjs state update와 document revision을 반환한다. `stateVector` query는 지원되지만 Desktop sync의 markdown download 경로는 full state를 요청한다.
- `POST /files/{fileId}/updates` body는 `{operationId, update}`이며 update는 base64 Yjs v1 update다. 성공 `ack`에는 `fileId`, `operationId`, `acceptedRevision`; 중복 update는 no-op/duplicate 의미를 유지한다.
- Yjs update 적용 경로는 UTF-8 Markdown materialized size를 512 KiB로 제한하고 초과 시 413 `markdown_too_large`를 반환한다. `/sync/download`도 cached current body의 512 KiB 초과를 `file_too_large` item error로 표현한다. **create-file operation에서 동일 제한이 적용되는지**는 RPC/DB validation 전체를 확인하고 통합 테스트로 고정해야 한다. 한 경로의 limit을 전체 mutation에 일반화하지 않는다.
- update는 CRDT operation이다. Desktop은 text-level baseline conflict 판단을 위해 server update를 Y.Doc에 적용해 `markdown` text를 얻는다. Yjs update ACK와 GitHub mirror flush는 별개 상태다.

## Realtime와 권한

Realtime `pkms:{workspaceId}` private channel의 protocol broadcast는 pull sync를 깨우는 신호다. 성공·cursor 이동의 authority는 HTTP revision feed다. Reconnect/subscribe 뒤 cursor catch-up을 수행하므로 broadcast 유실은 데이터 정합성 유실로 이어지지 않아야 한다.

Workspace API는 authenticated account의 membership을 먼저 확인한다. Desktop은 PKMS Main proxy에서 short-lived Realtime token을 받아 private channel에 사용한다. OAuth/PKMS bearer를 folder JSON이나 renderer state에 복사하지 않는다.

## 오류 매핑

| 응답                                        | Desktop 동작                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `400 invalid_path` / invalid cursor         | 경로/요청 계약 오류로 중단, 자동 성공 처리 금지                          |
| `404 not_found` / missing item              | manifest race 가능성으로 authoritative feed/snapshot 재조정              |
| `409 file_changed_since_base`               | local deletion을 확정하지 않고 remote 최신본을 보존·복구, attention 표시 |
| `409 folder_changed_since_base`             | subtree delete를 확정하지 않고 remote subtree를 복구, attention 표시     |
| network/5xx/timeout                         | durable operation identity·payload 보존 후 retry                         |
| `413 file_too_large` / `markdown_too_large` | 같은 payload를 무한 재시도하지 않음; 사용자에게 제한/조치 표시가 필요    |
| unauthorized/session expired                | offline/synced로 위장하지 않고 재인증 요구                               |

## 배포 호환성

새 `/sync/tree`는 folders/empty folders를 표현하고 `/snapshot`은 기존 markdown consumers를 유지한다. Desktop fallback은 route 미존재에만 적용되어야 한다. `guarded_sync_deletes` migration 미적용 server에서 destructive client를 배포하면 conditional subtree safety가 없을 수 있다. 따라서 배포 acceptance는 migration version 확인과 destructive operation runtime test를 포함한다.

근거: [workspace API routing](../../../../../apps/pkms-server/src/workspaceApi.ts), [vault HTTP handlers](../../../../../apps/pkms-server/src/SupabaseVault.ts), [operation RPC migration](../../../../../apps/pkms-server/supabase/migrations/20261101100000_workspace_operations.sql), [guarded delete migration](../../../../../apps/pkms-server/supabase/migrations/20261109160000_guarded_sync_deletes.sql), [Desktop request helpers](../../../../../apps/workspace-app/src/main/pkms/syncBridge.ts).
