# Reconciliation·baseline·충돌 계약

이 문서는 양쪽 변경을 비교해 사용자가 보게 될 최종 파일 상태를 정의한다. 내부 scheduler 구현보다 아래 행렬의 결과를 우선한다.

## 동기화 identity와 baseline

각 연결은 `workspaceId`와 canonical local root를 가진다. 서버 item identity는 `fileId`, 위치는 slash-separated relative `path`다. 파일이 이동해도 같은 `fileId`가 유지될 수 있으며 path는 변경된다. 로컬 baseline은 path별 `{ fileId, hash, revision }`이며 마지막으로 양쪽이 합의한 파일 bytes와 remote revision을 나타낸다.

일반 파일 동등성은 raw bytes의 SHA-256이다. Markdown은 UTF-8 text hash가 raw-byte hash와 같도록 BOM/줄바꿈을 임의 변환하지 않는다. 서버 Git import의 revision-0 SHA는 Git blob hash이므로 파일 bytes와 Git SHA를 비교하는 bootstrap 경로에서만 쓴다. 같은 해시라고 추정할 수 없으면 bytes를 가져와 비교한다. CRDT의 Yjs update는 Markdown transport/저장 단위이고, asset baseline은 raw file bytes 단위다.

로컬 scanner는 매 audit에서 경로·종류·크기·mtime·ctime·device/inode를 읽는다. fingerprint가 이전 값과 같으면 저장된 content hash를 재사용할 수 있다. fingerprint가 달라졌거나 cache가 없으면 파일을 열어 SHA-256을 계산한다. metadata만으로 remote와 동등하다고 판단하지 않는다. symlink와 제외 경로는 열거나 따라가지 않는다.

Baseline은 “해당 path를 다음에 무엇과 비교할지”를 정한다. 단순 path 같음이나 UI의 `synced` 표시는 baseline이 있다는 증거가 아니다. remote file ID 변경도 원격 변화로 취급한다.

## 결과 행렬

아래에서 `L`은 local file bytes, `R`은 remote item, `B`는 마지막 공통 baseline이다. Markdown은 Yjs document API, 일반 파일은 asset API로 전송한다.

| local 상태                                               | remote 상태                       | 결과                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 신규 L, 대응 B/R 없음                                    | 없음                              | remote create/upload를 수행하고 서버가 수락한 path/id/revision/hash를 baseline으로 기록한다. 동명 remote가 경쟁 생성된 경우 서버 conflict path를 반영한다.                        |
| L과 R 내용이 B와 동일                                    | unchanged                         | 변경 없음. ID/revision/hash 관계를 재확인한 baseline을 유지한다.                                                                                                                  |
| L만 B 이후 변경                                          | R은 B revision                    | local bytes를 remote에 반영하고 acknowledge된 revision을 baseline으로 기록한다.                                                                                                   |
| R만 B 이후 변경                                          | L은 B hash                        | 최신 R을 local에 원자 적용하고 새 hash/revision을 baseline으로 기록한다. 적용 직전 local 파일이 B와 달라졌으면 덮어쓰지 않고 다시 reconcile한다.                                  |
| L과 R 모두 B 이후 변경                                   | both changed                      | 두 내용 보존. local bytes를 고유 `.local-conflict-<timestamp>-<suffix><ext>` 경로에 보존하고 remote 최신 bytes를 원래 경로에 둔다. 두 경로가 각각 remote baseline을 얻는다.       |
| L 없음, B 없음, R 있음                                   | unmaterialized remote item        | 삭제로 해석하지 않는다. 안전 경로에 remote bytes를 materialize한다.                                                                                                               |
| L 없음, B 있음, R unchanged                              | local deletion                    | durable conditional delete intent를 만들고, 서버가 expected revision을 확인한 뒤 삭제한다.                                                                                        |
| L 없음, B 있음, R changed                                | local deletion과 remote edit 경합 | remote 최신 내용을 보존/복구하고 삭제를 거부한다. UI는 attention/conflict를 표시한다.                                                                                             |
| 두 create 요청이 같은 path와 같은 Markdown 본문으로 경합 | retry/동시 생성                   | 기존 remote file identity를 반환하고 추가 item을 만들지 않는다.                                                                                                                   |
| 두 create 요청이 같은 path에서 본문이 다름               | 실제 내용 충돌                    | 양쪽 내용을 보존하고 생성 요청은 고유 conflict path를 받는다.                                                                                                                     |
| 두 create-folder 요청이 같은 path                        | retry/동시 생성                   | 이미 존재하는 folder identity에 수렴한다. 빈 conflict folder를 만들지 않는다.                                                                                                     |
| remote descendant는 있으나 parent folder row가 없음      | 불완전한 tree metadata            | 같은 path에 folder marker와 directory metadata를 복구한다. descendant를 conflict path로 옮기거나 본문을 변경하지 않는다.                                                          |
| local path가 파일 대신 directory/symlink/비정상 항목     | R Markdown                        | local에 remote 본문을 덮어쓰지 않는다. 경로 안전 오류로 멈추고 attention을 남긴다.                                                                                                |
| R tombstone/missing                                      | local/B 상태에 따라 다름          | remote deletion을 local에 반영할 때 local이 B보다 바뀌었으면 local copy를 잃지 않도록 conflict-preserve 후 제거/재조정한다. 실제 경로별 분기는 source 대조가 필요한 acceptance다. |

결과 행렬이 보장하는 것은 변경 손실 방지와 결정적 보존 정책이다. 자동 text merge는 하지 않는다. 사용자가 두 문서를 직접 비교·병합한다.

## Folder metadata consistency

Active Markdown/asset path 아래에 child가 있으면 각 ancestor는 active `folder` row로 표현되어야 한다. 각 folder row에는 `/directory` 조회가 가능한 directory metadata가 있어야 한다. 이 조건이 없으면 문서 row가 Cloud에 있어도 Web TreeView에서 parent 폴더에 접근할 수 없다.

완전 directory scan은 local inventory를 remote folder manifest와 비교한다. remote marker가 없는 local directory는 depth 오름차순으로 등록한다. watcher 변경 힌트는 빠른 경로이며, 15분 full scan이 같은 비교를 다시 수행해 누락 이벤트를 복구한다. 서버 `create-folder`는 같은 path에 descendant row가 있을 때 그것을 이름 충돌로 보지 않고 parent marker를 복구한다. 정확히 같은 path에 비-folder row가 있으면 기존 conflict-path 정책을 유지한다.

기존 orphan descendant는 migration에서 ancestor folder/directory row를 보충한다. 복구는 folder metadata와 server revision만 추가하며 Markdown 내용·file identity·path를 이동하거나 삭제하지 않는다. Folder marker revision은 change feed가 발견할 수 있어야 한다.

## 생성 충돌과 중복 사본 정리

- operation ID가 바뀌어 같은 create가 재시도되어도 서버는 기존 path의 활성 item을 검사한다. Markdown은 cached UTF-8 본문이 요청 본문과 정확히 같을 때만 기존 `fileId/path/revision`을 no-op 결과로 반환한다. folder는 같은 path에 활성 folder가 있으면 그 identity에 수렴한다.
- 같은 path의 본문이 다르거나 활성 item kind가 다르면 기존 conflict-path 정책을 유지한다. 본문을 확인할 수 없는 Markdown은 같다고 추정하지 않고 충돌 경로에 보존한다.
- Desktop conflict 경로는 원본과 내용을 비교한 후에만 제거한다. 본문이 같은 사본은 conditional delete로 정리한다. 본문이 다르면 원본 또는 사본을 삭제하지 않고 사용자 검토 상태로 남긴다.
- 삭제된 cloud row는 revision feed/Git mirror가 처리할 수 있도록 tombstone으로 보존한다. UI/active tree에서는 사라지지만 문서 내용이 즉시 DB에서 hard-delete되지는 않는다.
- 충돌 경로에 데이터가 있는데 같은 경로의 원본이 없으면 자동 삭제하지 않는다. 원본 복구 또는 안전한 이동을 먼저 완료해야 한다.

2026-11-13 복구 결과: 활성 `(conflict desktop-*)` Markdown 842개는 각각 원본이 존재하고 본문이 같았으며, 로컬 846개도 SHA-256이 같았다. 활성 cloud copy는 revision guard가 있는 delete operation으로 tombstone 처리했고, 로컬 copy 846개와 비어 있던 충돌 폴더 2개를 제거했다. 기존에 내용이 달랐던 `guitaringo.md` conflict row는 이미 tombstone이었고, 현재 로컬·Cloud 본문은 일치한다. 모든 활성 로컬 Markdown 3,706개를 Cloud Yjs 본문 또는 revision-0 Git blob SHA와 대조해 일치 3,706개, 차이 0개를 확인했다. 복구 전 cloud snapshot과 local 경로/hash manifest는 `~/Library/Application Support/workspace-app/pkms-recovery-20261113/`에 보관한다.

## 원격 변경 수렴

1. 저장된 revision cursor부터 server change feed를 읽는다. Realtime event는 poll을 깨우는 신호이며 authority가 아니다.
2. 모든 page를 `(revision, fileId)` 순서로 이어 읽는다. 한 pass가 잡은 `currentRevision`보다 뒤의 mutation은 다음 pass가 처리한다.
3. 변경 metadata에서 이전 path와 새 path를 dirty set에 넣는다. folder move/delete는 하위 path도 재평가한다.
4. 변경 파일 본문은 revision/hash가 baseline과 다를 때 읽는다. stale manifest에서 내려간 파일은 tombstone/missing으로 정리한다.
5. local write는 temporary file에 쓰고 기존 경로가 예상 hash와 일치하는지 확인한 뒤 rename한다. 쓰기 경쟁이면 현재 파일을 보존하고 다시 비교한다.
6. 필요한 파일 mutation이 성공하고 새 baseline·tree·cursor를 저장한 뒤에만 해당 pass를 완료로 표시한다.

## GitHub backup branch divergence

GitHub backup은 별도 replica다. 원격 branch head가 PKMS가 마지막으로 기록한 `github_head`와 다르면 서버는 자동 push를 멈춘다. Common ancestor가 없거나 tree가 서로 다른 경우에도 branch reset/force push로 해결하지 않는다.

| GitHub branch와 PKMS 상태                                                                    | 요구 결과                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GitHub head가 마지막 PKMS commit의 직접 후손이고 변경 경로가 pending PKMS 경로와 겹치지 않음 | branch tree를 보존하고 fast-forward 가능한 경우에만 PKMS backup을 이어간다.                                   |
| GitHub direct commit이 pending PKMS 경로와 겹침                                              | 자동 덮어쓰기 금지. 두 내용을 보존하는 reconciliation 대상으로 표시한다.                                      |
| branch history가 unrelated 또는 commit 범위/내용을 확인할 수 없음                            | `external-change`를 유지하고 자동 push를 중지한다. 사용자 데이터에는 어떠한 자동 삭제/재기준화도 하지 않는다. |
| path별 tree/content 대조가 끝나고 양쪽 변경이 안전하게 import됨                              | 일반 parent를 가진 새 commit으로 통합 branch를 만든다. force update는 허용하지 않는다.                        |

GitHub import acceptance는 commit graph만 확인하지 않는다. base tree, 현재 GitHub tree, PKMS 현재 tree를 path/content hash로 비교해 GitHub-only 변경, PKMS-only 변경, 동일 변경, 같은 path의 양쪽 변경을 구분해야 한다. 양쪽이 같은 path를 서로 다르게 수정했으면 두 content를 conflict-preserving 경로에 보존한 뒤 review 완료 전까지 원본을 덮어쓰지 않는다.

2026-11-13 Cloud-authoritative Git backup 복구 결과: 기록된 Cloud `github_head`와 GitHub `main`의 이력은 unrelated였고, 세 tree의 경로·blob 해시 비교를 마친 뒤 Cloud 활성 파일 tree를 담은 일반 Git commit을 만들었다. 기존 GitHub head를 새 commit의 parent로 유지해 force update 없이 `main`을 전진시켰다. 새 tree는 Cloud 활성 비-folder row 12,472개와 경로·SHA·mode가 전부 일치하며 extra/missing/mismatch는 0개다. 완료 후 Cloud `github_head`와 `mirrored_head`를 새 commit으로 맞췄고 `github_status=synced`, dirty row 0을 확인했다. 기존 GitHub head와 cloud snapshot은 복구 디렉터리에 보관한다.

Snapshot은 `atRevision`에 pin된 metadata tree를 페이지 단위로 읽는다. cursor와 path별 revision은 같은 의미가 아니다. tree metadata snapshot이 cursor 이후의 변경을 포함했다고 간주하지 않는다.

## Path safety

- 모든 remote path는 workspace root 기준 상대 경로다. absolute path, `..`, 빈 segment, slash escape를 허용하지 않는다.
- `.git`, `.obsidian`, `node_modules` 및 사용자 exclusion은 content scan과 directory inventory 양쪽에서 제외한다. `.pkms`는 ordinary path다.
- symlink를 따라가거나 symlink target에 write/delete 하지 않는다. 각 parent segment가 실제 directory인지 검사한다.
- remote apply가 기존 파일을 교체할 때 baseline hash를 조건으로 사용한다. 검사 도중 외부 편집이 있으면 `local_file_changed_retry`로 멈추고 다음 scan에서 다시 비교한다.
- local-only collision은 원본을 덮지 않는다. 서버 create operation이 deterministic client conflict suffix를 반환한다.

## 미확정/검증 필요

- 파일 삭제와 remote tombstone이 동시에 발생할 때 모든 순서의 결과가 integration fixture로 고정되어 있지 않다.
- 같은 경로를 다른 identity로 재생성하고 오래된 baseline이 남아 있는 경우의 정책을 테스트로 고정해야 한다.
- 폴더 subtree 내용 충돌은 자동 병합하지 않고 folder delete guard를 사용한다. 이동과 동시 자식 생성의 결과도 server transaction 기준으로 검증한다.
- 대용량 본문 제한과 Yjs update가 복원 가능한지에 대한 최종 server contract는 [protocol](./server-protocol.md)을 따른다.

근거: [syncBridge reconciliation](../../../../../apps/workspace-app/src/main/pkms/syncBridge.ts), [atomic local apply](../../../../../apps/workspace-app/src/main/pkms/syncBridge.ts), [server operations](../../../../../apps/pkms-server/src/SupabaseVault.ts), [operation migrations](../../../../../apps/pkms-server/supabase/migrations/20261101100000_workspace_operations.sql).
