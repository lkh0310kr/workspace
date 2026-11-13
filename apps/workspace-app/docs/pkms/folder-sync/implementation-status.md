# Folder sync 현재 구현·배포 상태

이 문서는 `2026-11-13` source 및 원격 상태 review snapshot이다. 목표 동작은 [contract](./README.md)와 하위 계약을 본다. 이 페이지의 수치와 helper 구조는 구현 관찰이며 미래 구현의 요구가 아니다.

## 현재 Desktop 구현 관찰

| 영역 | source에서 확인한 현재 방식 | 결과상 제한 / 검증 필요 |
|---|---|---|
| 구성 저장 | `userData/pkms-sync-bridge.json`, temp sibling write 후 rename, mode 0600 | load/JSON 손상은 현재 empty state fallback. 이전 데이터가 안전하게 salvage된다는 보장 없음 |
| root 전환 | 새 root 연결 전 기존 root 기반 baselines/cache/cursor/local inventory/delete intents 초기화; 새 pass가 Cloud snapshot부터 다시 구성 | policy unit test 통과. 임시 폴더 + fake API로 기존 Cloud file이 삭제되지 않고 새 root가 materialize/import되는 통합 acceptance는 미구현 |
| 동시 실행 | workspace당 in-process running pass, 같은 root에 process간 PID/token lock | lock filesystem·process 종료 경로를 OS별 테스트해야 함 |
| local change | recursive `fs.watch`, event hint; 25ms debounce, 불완전 event는 full scan | watcher가 durable journal은 아님 |
| remote change | private Realtime `pkms:{workspaceId}` wakeup + HTTP revision cursor; 30초 poll | Realtime은 authority가 아니며 poll fallback 유지 |
| local audit | startup/reconfigure와 15분 주기 complete walk | scan 실패 시 이전 inventory 유지하고 delete 금지 |
| content scan | full scan 또는 dirty/remote path scan; Markdown `.md`만, reserved/excluded/symlink 제외 | 다른 binary attachment는 bridge 대상 아님 |
| snapshot | `/sync/tree`, 1000 row/path page, captured revision pin; route 404면 legacy `/snapshot` fallback | legacy는 empty folder metadata를 완전히 제공하지 않음 |
| body transfer | `/sync/download` batch 32, 4 workers; per-path reconcile 최대 6 | 이 숫자는 최적 성능 요구가 아니라 현재 설정. 제한·측정 증거 필요 |
| retry | retryable status/lock/local-race/network 오류에 1s부터 증가, 최대 60s | 네트워크/인증 분류가 message pattern에 의존하는 경계가 있어 fixture 필요 |
| local write | UTF-8 temp sibling, baseline/current hash 확인, rename | power loss/disk full의 모든 OS guarantee는 미검증 |
| status | top-level state/stage, pass progress, transient item state | per-item state durable 복구가 아님; aggregate percent는 denominator가 변할 수 있음 |
| local delete + cloud edit 경합 | 삭제 intent 대신 최신 cloud 본문을 원래 경로로 복구하고 `attention`을 남김 | 2026-11-13 source fix; 실행 중 packaged app 반영은 새 빌드 필요 |
| 동일 경로·동일 본문 create 재시도 | 기존 identity로 no-op 수렴; 다른 본문은 conflict path 유지 | 2026-11-13 migration 적용, linked DB regression SQL 통과 |
| 한 pass의 sibling folder guarded deletes | 매 delete 직전 최신 pass revision 사용 | 2026-11-13 source fix 및 policy unit scenario 추가; full sync acceptance 필요 |

## Persisted schema source shape

현재 `Persisted` top-level field: `configs`, `baselines`, `remoteFiles`, `syncCursors`, `remoteTrees`, `remoteTreeVersions`, `pendingPaths`, `pendingUpdates`, `pendingCreates`, `pendingFolderCreates`, `localDirectories`, `pendingDeletes`. field별 의미는 [durability contract](./durability-recovery.md)에서 정규 정의한다. JSON 파일에는 명시적 schema version/migration registry가 아직 없다.

`pendingCreates`/`pendingUpdates`/`pendingDeletes`에는 operation identity와 재시도에 필요한 payload/guard 일부가 있다. `pendingPaths`는 dirty path hint이며 모든 파일 변경 payload를 담은 operation journal은 아니다. directory inventory와 pending delete는 durable, item UI state는 현재 status memory다.

## Remaining critical root-switch acceptance

Source now resets root-derived state before saving the new configuration. This removes the identified stale-baseline delete path. The behavior still needs a fake-server integration scenario that starts with existing cloud files, switches to an empty temporary root, and asserts that cloud IDs/revisions/body hashes are unchanged while the new root receives the files. A second scenario must seed the new root with local-only and divergent same-path content and verify import/conflict preservation. Until those scenarios pass, do not treat root-switch end-to-end acceptance as complete.

## Current user-visible implementation

`SyncBridgePanel`은 5초 poll로 status를 읽고 aggregate `completed/total` 퍼센트를 표시할 수 있다. Main status는 `disconnected/syncing/synced/offline/error`, item state는 `pending/syncing/attention`이다. conflict path 일부를 텍스트로 보여주지만 직접 열기 action이나 durable review queue는 제공하지 않는다. UI는 GitHub backup 상태도 함께 보여주지만 distinct channel로 표시한다.

## GitHub 방향과 실시간 배포 상태

- GitHub는 초기 repository import 후 PKMS database에서 내보내는 backup 경로다. 이후 GitHub branch 변경은 현재 자동으로 cloud로 import/merge하지 않고 `external-change` 상태에서 자동 push를 멈춘다. 따라서 direct Git edits와 PKMS cloud edits가 같은 파일을 바꿨을 때 자동 수렴은 구현되어 있지 않다.
- 2026-11-13 원격 확인에서 workspace가 `external-change`였고 로컬 Git branch와 cloud가 기록한 Git head가 달랐다. 이 상태에서는 양쪽 변경을 보존하는 reconciliation 없이 branch reset이나 강제 push를 수행하면 안 된다.
- 원격 Supabase에 빠져 있던 `20261109160000_guarded_sync_deletes.sql`을 2026-11-13 적용했다. 이 migration은 이후 destructive sync operation의 revision guard를 보강하며 기존 파일 row를 수정하지 않는다.
- 2026-11-13 `20261113100000_dedupe_identical_sync_creates.sql` 적용. 같은 경로·같은 본문 create retry는 기존 item을 반환하며, 본문이 다를 때만 conflict path를 만든다. `supabase/tests/20261113100000_dedupe_identical_sync_creates.sql`를 linked DB에서 트랜잭션 rollback 방식으로 실행해 동일 본문 Markdown, operation retry, 다른 본문 보존, 같은 folder 생성 수렴을 확인했다.
- `conflict desktop` 사본 복구: 활성 Cloud Markdown 842개와 local 846개 모두 원본과 본문/hash가 같아 안전하게 정리했다. Cloud 사본은 guarded operation으로 tombstone 처리했고 local copy와 두 빈 충돌 폴더를 제거했다. 다른 내용이었던 과거 `guitaringo.md` conflict row는 기존 tombstone 이력을 보존했고 최신 원본은 유지했다. 복구 전 Cloud snapshot과 local 경로/hash manifest는 `~/Library/Application Support/workspace-app/pkms-recovery-20261113/`에 보관한다.
- Local↔Cloud 본문 검증: 활성 Markdown 3,706개 전부 로컬 파일과 Cloud Yjs 본문이 byte-for-byte 일치했다. Yjs state가 비어 있는 18개는 같은 revision-0 Git blob SHA로 확인했다. conflict 정리 후 Desktop PKMS에서 complete sync를 실행했다. persisted cursor 2,638이 Cloud revision 2,638과 같고 baseline/remote cache 각각 3,706개, pending path/create/update/delete 모두 0개임을 확인했다. 패널도 `Up to date`, 100%를 표시했으며 active conflict copy는 0개다.
- Cloud↔GitHub 복구 완료: 기존 GitHub `main` head `a54094655faa89a7c2263325ea0e8430062f9533`를 parent로 둔 일반 commit `7af23452cc28b4651a0f7dbf7bf05c719331291c`을 만들어 Cloud 활성 tree로 전진시켰다. force update 없이 완료했다. 최종 12,472개 경로의 SHA/mode 비교에서 차이 0개, Cloud `github_head=mirrored_head=7af23452cc28b4651a0f7dbf7bf05c719331291c`, `github_status=synced`, dirty row 0을 확인했다.
- 최종 Cloud tree와 현재 GitHub `main` tree가 일치하지만 direct Git edits는 여전히 자동 Cloud import/merge하지 않는다. branch가 외부에서 바뀌면 `external-change`로 멈추고 tree reconciliation 후 일반 commit으로 복구한다. force push/reset은 복구 절차가 아니다.
- Root/workspace source가 다르면 local scan의 deletion inference를 차단해야 한다. 이 guard는 기존 open issue라 전체 recovery acceptance에서 별도 통과가 필요하다.

## 배포·검증

- [local deletion](./deletion.md)의 inventory/pending delete/guarded delete는 source에 있다.
- migration 적용은 `supabase migration list --linked`로 확인했다. 중복 create 회귀 SQL, 현재 7개 sync policy unit test, `npm run check:app`은 통과했다. 전체 `npm test`는 626 passed, 2 skipped, 8 failed로 끝났으며 실패는 shortcut 2, `global.gc`가 없는 queue-retention 3, CodeMirror extension 1, TreeView display-name 1, closeTab 1이다. 이들은 이번 sync 변경과 무관한 기존 실패로 분류하되 전체 suite는 green이 아니다.
- 원격 Cloud/Git tree reconciliation, local complete pass 및 데이터 hash 검증은 완료했다. `syncBridge` end-to-end behavioral test와 앱 재시작 후 상태 유지 검증은 여전히 없다. 현재 local↔Cloud 일치 상태와 code-level failure recovery 검증은 구분해서 보고한다.
- local folder rename (stable inode), empty folder, interrupted delete, dropped watcher, lost successful HTTP response, JSON corruption, disk full, server migration mismatch에 대한 실제 acceptance가 남아 있다.
- 아래 acceptance matrix의 root-switch fake-server fixture, 재시작, lost acknowledgement, macOS watcher, 다중 기기 충돌 fixture와 server transaction race가 필요하다.

관련 소스: [Desktop syncBridge](../../../src/main/pkms/syncBridge.ts), [status type](../../../src/shared/pkmsSyncBridge.ts), [settings panel](../../../../../packages/pkms-client/src/components/SyncBridgePanel.tsx), [PKMS vault](../../../../pkms-server/src/SupabaseVault.ts), [delete guard migration](../../../../pkms-server/supabase/migrations/20261109160000_guarded_sync_deletes.sql).
