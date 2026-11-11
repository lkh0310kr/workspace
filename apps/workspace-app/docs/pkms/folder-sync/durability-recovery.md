# Durability·queue·재시작·복구

이 계약은 작업이 process/network interruption을 넘어 살아남는 범위와 안전하게 멈추는 조건을 정의한다. UI status만으로 durable 상태를 추정하지 않는다.

## Durable record

Main의 `pkms-sync-bridge.json`은 Electron `userData` 아래 저장되며 temporary sibling file 작성 후 rename한다. Top-level `Persisted`의 의미는 다음과 같다.

| 필드 | 의미 / 소유 결과 |
|---|---|
| `configs[workspaceId]` | realpath로 확인한 root와 상대 exclusion pattern |
| `baselines[workspaceId][path]` | 마지막 공통 file id/content hash/revision |
| `remoteFiles`, `remoteTrees` | 서버에서 읽은 remote metadata cache; authoritative server 데이터가 아님 |
| `syncCursors[workspaceId]` | 마지막으로 반영한 server workspace revision |
| `remoteTreeVersions` | renderer tree cache invalidation version; server revision과 다름 |
| `pendingPaths` | watcher에서 받아 아직 scan/reconcile하지 못한 local path hint |
| `pendingCreates` | create operation ID/file ID/content/hash. lost response 후 같은 mutation 재시도 |
| `pendingFolderCreates` | path별 folder create operation ID |
| `pendingUpdates` | file ID별 operation ID/target hash/Yjs update |
| `localDirectories` | 마지막 complete scan의 relative directory→device/inode 또는 null |
| `pendingDeletes` | file/folder deletion target, ID, operation ID, guard revision, attempts/time |

Persisted JSON load 중 parse/read 실패는 현재 코드에서 empty state로 fallback한다. 이는 복구된 baseline/queue임을 증명하지 않으므로 손상 파일 복구 여부는 명시적인 test gap이다. save failure는 pass를 성공으로 간주하지 않는다. durability 요구는 storage-full·truncated JSON·power loss에서 별도 검증한다.

## Event와 scan 의미

- `fs.watch` event는 dirty hint이지 변경의 완전한 기록이 아니다. null filename, rename, watcher error는 전체 directory scan을 요청한다.
- 15분 complete scan은 watcher에서 놓친 변경과 directory identity 변화를 복구한다. root 또는 하위 directory 열거가 실패하면 inventory를 교체하지 않고 deletion을 추론하지 않는다.
- Initial inventory 없는 기존 설치는 첫 complete scan을 seed-only로 커밋한다. 첫 scan은 cloud-only folder를 삭제하지 않는다.
- directory identity `(dev, ino)`가 이전 누락 path 하나와 새 경로 하나에만 대응하면 move 후보로 처리한다. 누락/중복 identity면 이동을 추측하지 않는다.
- `.git`, `.obsidian`, `node_modules`, `.pkms`, configured exclusions와 symlink는 scan 기준에서 제외한다.
- 수동 scan은 full scan과 directory inventory를 요청한다. 수동 scan 성공은 서버 배포·다른 기기 반영을 의미하지 않는다.

## Queue·작업 순서

1. 변경 경로를 pending path로 저장하고 UI에는 pending을 표시한다.
2. workspace별 sync pass를 직렬화하고 같은 root에는 process 간 lock을 확보한다. lock owner가 살아 있으면 다른 instance는 진행하지 않는다.
3. directory inventory가 필요하면 cloud folder materialization 이전에 complete scan을 한다. scan 불완전이면 삭제 관련 단계를 중단한다.
4. 새 remote metadata/cursor를 가져오고 durable file create/update/delete operation을 network call 전에 저장한다.
5. unrelated path들은 제한된 병렬 작업으로 처리하되 path/parent dependency가 있는 operation은 안전하게 순서화한다.
6. remote mutation acknowledgement와 새로운 baseline/tree/cursor를 저장한다. ack 전에 작업을 완료/삭제로 표시하지 않는다.
7. pending create/update/delete는 server가 operation ID 중복을 확인하거나 authoritative snapshot으로 이미 반영됨을 확인한 다음에만 제거한다.

핵심 규칙은 **network timeout이 성공 여부를 모호하게 해도 재시도 identity와 payload를 바꾸지 않는 것**이다. 정합성이 서버 idempotency에 의존하는 mutation에서 새 operation ID로 무작정 재시도하지 않는다.

## Retry·offline·cancel

- 연결 실패 시 cursor/baseline을 실제로 반영된 지점보다 앞으로 진행하지 않는다.
- retry 가능한 실패는 exponential backoff를 적용하고 pending path/operation을 보존한다. 한 path 오류가 unrelated path 작업을 모두 지우지 않는다.
- 인증 만료/권한 거부는 offline과 같은 성공 상태로 표시하지 않는다. 사용자가 재인증/권한 복구를 해야 하는 attention/error 상태여야 한다.
- disconnect/reconfigure는 watcher·poll·Realtime·timer를 정리하고 실행 중 pass를 기다린다. 저장된 configs/queue/remote cache 삭제 정책은 사용자가 연결 해제 또는 root 교체를 선택한 범위에 따른다.
- Root 변경은 삭제 의미를 갖지 않는다. 새 root의 첫 complete inventory를 별도 seed로 삼고 기존 root의 baseline 부재로 cloud delete를 만들지 않아야 한다. **현재 source gap:** configure 시 `localDirectories`/`pendingDeletes`는 제거하지만 `baselines`는 유지한다. 이 경로에서 새 root가 old baseline의 파일을 포함하지 않으면 unintended remote delete 가능성이 있으므로 root replacement를 safe/unverified로 표시하고 변경 전 확인 또는 source fix가 필요하다.
- 앱 graceful shutdown은 실행 중 pass를 다룬 후 handle을 종료한다. force kill/crash는 마지막 성공적으로 rename된 JSON까지만 보장 가능하며 shell sync를 백그라운드에서 계속한다고 가정하지 않는다.

## Folder lock과 path security

Root realpath 하나에는 동시에 하나의 Workspace process만 sync한다. lock 파일은 temp lock directory 아래에 exclusive create되고 PID/token이 기록된다. 살아 있는 process lock은 제거하지 않는다. stale lock cleanup failure는 sync 중단으로 귀결되어야 하며 동시 writer 허용으로 회복하지 않는다.

모든 path join은 canonical root 내부인지 확인한다. symlink parent/file을 따라가지 않으며 atomic local replacement는 temp sibling → expected-current-hash 확인 → rename 순이다. delete에서도 가능하면 expected hash를 확인해 sync 중간에 생성된 local edit를 지우지 않는다.

## 검증 상태

현재 `syncBridge.ts`에는 독립 behavioral test file이 발견되지 않았다. 따라서 위 순서는 코드에서 추출된 계약이며 실행 검증 완료가 아니다. 필수 failure injection: process restart at each pending state, lost HTTP response after commit, JSON write failure, disk full, incomplete scan, stale lock, auth expiry, symlink substitution, root disappears, watcher drop/reconnect, duplicate event storm.

근거: [syncBridge](../../../src/main/pkms/syncBridge.ts), [folder lock and storage](../../../src/main/pkms/syncBridge.ts), [shutdown owner](../../runtime/README.md), [state status type](../../../src/shared/pkmsSyncBridge.ts).
