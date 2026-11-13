# Folder sync 현재 구현·배포 상태

이 문서는 `2026-11-13` source 및 원격 상태 review snapshot이다. 목표 동작은 [contract](./README.md)와 하위 계약을 본다. 이 페이지의 수치와 helper 구조는 구현 관찰이며 미래 구현의 요구가 아니다.

## 현재 Desktop 구현 관찰

| 영역 | source에서 확인한 현재 방식 | 결과상 제한 / 검증 필요 |
|---|---|---|
| 구성 저장 | `userData/pkms-sync-bridge.json`, temp sibling write 후 rename, mode 0600 | load/JSON 손상은 현재 empty state fallback. 이전 데이터가 안전하게 salvage된다는 보장 없음 |
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

## Persisted schema source shape

현재 `Persisted` top-level field: `configs`, `baselines`, `remoteFiles`, `syncCursors`, `remoteTrees`, `remoteTreeVersions`, `pendingPaths`, `pendingUpdates`, `pendingCreates`, `pendingFolderCreates`, `localDirectories`, `pendingDeletes`. field별 의미는 [durability contract](./durability-recovery.md)에서 정규 정의한다. JSON 파일에는 명시적 schema version/migration registry가 아직 없다.

`pendingCreates`/`pendingUpdates`/`pendingDeletes`에는 operation identity와 재시도에 필요한 payload/guard 일부가 있다. `pendingPaths`는 dirty path hint이며 모든 파일 변경 payload를 담은 operation journal은 아니다. directory inventory와 pending delete는 durable, item UI state는 현재 status memory다.

## Critical unresolved source risk

`configurePkmsSyncBridge`에서 기존 workspace의 `folderPath`가 달라지면 `localDirectories`와 `pendingDeletes`는 지우지만 `baselines`, `remoteFiles`, `remoteTrees`, `syncCursors`는 유지한다. 새 root가 비어 있으면 full reconciliation의 `local absent + remote present + baseline present` 경로가 기존 Markdown을 조건부 cloud delete로 제출할 수 있다. 따라서 root 교체가 remote Markdown을 mass-delete하지 않는다는 acceptance는 현재 통과로 볼 수 없다. 사용자 확인만으로 remote revision/concurrent edits guard가 해결되는 것도 아니므로 source의 신규-root seed/migration 경계를 수정하고 destructive test를 추가해야 한다.

## Current user-visible implementation

`SyncBridgePanel`은 5초 poll로 status를 읽고 aggregate `completed/total` 퍼센트를 표시할 수 있다. Main status는 `disconnected/syncing/synced/offline/error`, item state는 `pending/syncing/attention`이다. conflict path 일부를 텍스트로 보여주지만 직접 열기 action이나 durable review queue는 제공하지 않는다. UI는 GitHub backup 상태도 함께 보여주지만 distinct channel로 표시한다.

## GitHub 방향과 실시간 배포 상태

- GitHub는 초기 repository import 후 PKMS database에서 내보내는 backup 경로다. 이후 GitHub branch 변경은 현재 자동으로 cloud로 import/merge하지 않고 `external-change` 상태에서 자동 push를 멈춘다. 따라서 direct Git edits와 PKMS cloud edits가 같은 파일을 바꿨을 때 자동 수렴은 구현되어 있지 않다.
- 2026-11-13 원격 확인에서 workspace가 `external-change`였고 로컬 Git branch와 cloud가 기록한 Git head가 달랐다. 이 상태에서는 양쪽 변경을 보존하는 reconciliation 없이 branch reset이나 강제 push를 수행하면 안 된다.
- 원격 Supabase에 빠져 있던 `20261109160000_guarded_sync_deletes.sql`을 2026-11-13 적용했다. 이 migration은 이후 destructive sync operation의 revision guard를 보강하며 기존 파일 row를 수정하지 않는다.

## 배포·검증

- [local deletion](./deletion.md)의 inventory/pending delete/guarded delete는 source에 있다.
- migration 적용은 `supabase migration list --linked`로 확인했다. 원격 PKMS cloud/Git branch reconciliation은 별도 처리와 확인이 필요하다.
- 현재 workspace-app·pkms-server에는 `syncBridge` end-to-end behavioral test 파일이 발견되지 않았다. Typecheck/Realtime schema check는 delete race/atomicity/파일 보존 수락을 증명하지 않는다.
- local folder rename (stable inode), empty folder, interrupted delete, dropped watcher, lost successful HTTP response, JSON corruption, disk full, server migration mismatch에 대한 실제 acceptance가 남아 있다.
- 실제 macOS filesystem watcher와 cloud multi-client test, server DB transaction race test가 필요하다.

관련 소스: [Desktop syncBridge](../../../src/main/pkms/syncBridge.ts), [status type](../../../src/shared/pkmsSyncBridge.ts), [settings panel](../../../../../packages/pkms-client/src/components/SyncBridgePanel.tsx), [PKMS vault](../../../../pkms-server/src/SupabaseVault.ts), [delete guard migration](../../../../pkms-server/supabase/migrations/20261109160000_guarded_sync_deletes.sql).
