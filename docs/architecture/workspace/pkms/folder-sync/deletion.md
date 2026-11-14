# PKMS 로컬 삭제 동기화 스펙

로컬 파일·폴더 삭제를 PKMS cloud tree에 반영하는 계약이다. 전체 결과와 reconciliation은 [Desktop folder sync](./README.md), baseline 규칙은 [reconciliation](./reconciliation.md)에 정의한다.

## 상태

**source 구현 완료. 운영 migration 적용과 macOS runtime 수락은 대기 중이다.**

## 문제와 관찰된 실패

연결된 로컬 폴더는 사용자가 편집하는 원본이다. Finder나 다른 편집기에서 파일 또는 디렉터리를 삭제하면 cloud tree에서도 자동으로 제거해야 한다.

`engineering`에서 관찰한 순서는 다음과 같다.

1. 로컬 디렉터리와 그 안의 note를 삭제하거나 이동했다.
2. Bridge가 사라진 Markdown path를 처리했지만 빈 원격 folder record는 남았다.
3. `syncOnce()`가 로컬 path를 reconciliation하기 전에 각 원격 folder를 `mkdir(..., { recursive: true })`로 materialize했다.
4. 디렉터리가 빈 folder로 로컬에 다시 생겼고 PKMS tree에도 남았다.

이 사례는 durable deletion 구현 전에 관찰됐다. 현재 source에는 directory inventory와 pending delete intent가 추가됐으며 남은 배포·runtime 확인은 아래에 기록했다. 과거 장애 기록을 현재 source 상태로 혼동하지 않는다.

`engineering` 정리에서는 `로봇/연구/TM 협동로봇 소프트웨어/` 아래의 내용이 있는 robotics note 3개를 보존하고 placeholder note와 완전히 중복된 conflict copy를 제거했다. 로컬 Git 변경은 `976631f`로 commit했다. Cloud에는 빈 `engineering` folder metadata가 남아 있고 로컬에도 빈 디렉터리가 다시 만들어졌다. 원격 folder tombstone이 승인될 때까지 이 정리를 완료로 보지 않는다.

## 현재 source 구현

구현은 `apps/workspace-app/src/main/pkms/syncBridge.ts`에 있다.

- Bridge는 directory identity inventory를 저장한다. Watcher의 rename/drop event와 주기적 scan을 사용해 folder가 사라졌는지 확인한다.
- Pending file/folder delete는 operation ID를 유지하고 bridge tree에서 행을 숨긴다. 승인 뒤 cache 상태를 정리한다.
- 로컬 folder를 rename하면 안정적인 directory identity로 cloud move 요청을 보낸다.
- Server는 file의 `expectedRevision`을 확인한다. `protectSubtree`가 있는 folder delete는 현재 보수적인 workspace revision 일치 guard를 사용한다. 대상 subtree 밖에서 일어난 변경도 삭제를 거부할 수 있다. 이는 설계의 대상 전용 guard보다 엄격하며 원격 데이터 보존을 우선한다. 이후 operation path index를 기록하면 guard 범위를 좁힐 수 있다.
- Folder bridge는 현재 Markdown 문서와 folder metadata를 동기화한다. 다른 로컬 파일과 binary attachment는 manifest와 transfer protocol에 추가되기 전까지 이 삭제 계약의 대상이 아니다.

## Cloud에서 시작된 folder 삭제

Web/Cloud에서 사용자가 folder subtree를 삭제하면 활성 manifest에서 folder marker와 하위 item이 사라진다. Desktop은 revision feed tombstone의 이전 folder path 또는 기존 manifest와 authoritative snapshot의 ID 차이로 삭제를 인식한다. 서버 change feed가 폴더 marker만 tombstone으로 보내더라도 이전 manifest에서 해당 경로 아래 Markdown을 dirty path에 넣어 파일 baseline reconciliation을 수행한다.

- Remote-deleted path는 같은 sync pass의 local directory reconciliation에서 재등록하지 않는다.
- 삭제된 경로에 local 변경 Markdown이 있으면 기존 reconciliation 규칙대로 conflict copy를 보존한다. 해당 경로에 새 active remote item이 남으면 폴더를 유지한다.
- 삭제된 폴더가 여전히 로컬에 있고 active remote descendant가 없으면 Electron OS Trash로 이동한다. `fs.rm`로 영구 삭제하지 않는다. 사용자는 Finder/운영체제 휴지통에서 local-only 파일과 binary asset을 복구할 수 있다.
- 폴더를 옮긴 뒤 `localDirectories`에서 해당 subtree inventory를 제거하고 `pkms:local-tree:changed`를 발행한다. 따라서 Desktop Files tree가 즉시 새 로컬 filesystem 상태를 읽는다.
- Change feed tombstone이 아니라 단순 snapshot 부재만으로 첫 연결/초기 seed에서 local folder를 삭제하지 않는다. 기존 remote manifest를 가진 snapshot recovery에서만 기존 folder ID가 snapshot에 없어진 경우를 tombstone으로 본다.
- Trash 이동 실패는 sync pass를 실패시키고 retry/log 대상으로 둔다. 경로 밖 이동, symlink 추적, 영구 삭제는 허용하지 않는다.

이 동작은 사용자가 Cloud에서 명시적으로 수행한 subtree 삭제를 replica에 반영하면서 Desktop 전용 binary content를 복구 가능하게 보존한다. Local folder에서 시작된 삭제는 기존 conditional delete 흐름을 유지한다.

Watcher event만으로는 삭제를 확정할 수 없다. 그렇다고 삭제 감지를 포기해서는 안 된다. Event는 확인을 시작하는 신호이며 완전한 로컬 directory inventory가 판단 근거다.

## 목표와 불변 조건

1. 검증된 로컬 scan으로 확인한 Markdown file·folder 삭제를 cloud에 자동 반영한다.
2. 삭제가 대기 중이거나 승인된 뒤에는 stale cache metadata로 삭제 항목을 다시 만들지 않는다.
3. Scan 실패, root 누락, 제외 경로, watcher event drop을 삭제로 처리하지 않는다.
4. File·folder 삭제는 재시작, timeout, offline 재시도 후에도 durable하고 idempotent해야 한다.
5. 로컬 sync cursor 이후 발생한 원격 변경을 stale local delete로 조용히 지우지 않는다.
6. 삭제된 parent folder는 한 번만 요청하고 하위 file을 각각 tombstone하지 않는다.
7. 최초 연결에서 아직 materialize하지 않은 cloud folder를 로컬 삭제로 해석하지 않는다.
8. Pending local delete는 즉시 숨기고 해결될 때까지 pending 또는 attention 상태로 표시한다.

## 보존해야 하는 durable evidence

결과 계약상 process 재시작 후에도 이전의 완전한 directory inventory와 삭제 intent를 유지해야 한다. 아래 persisted data shape은 요구를 위한 **versioned schema 제안**이며 현재 JSON 구조를 설명하는 것이 아니다. 현재 source는 `localDirectories[workspaceId]`에 `relativePath -> device:inode|null` map을 저장하고, 예시의 `version`, `generation`, `completedAt`은 저장하지 않는다. migration 지원 여부를 판단하기 전에 [구현 상태](./implementation-status.md)를 확인한다.

### 제안하는 로컬 directory inventory

연결된 workspace별 완전한 로컬 inventory를 `pkms-sync-bridge.json`에 보존한다.

```ts
type LocalDirectoryEntry = {
  path: string
  identity: string | null // device + inode when the platform supplies a stable identity
}

type LocalDirectoryInventory = {
  version: 1
  generation: number
  completedAt: number
  directories: Record<string, LocalDirectoryEntry>
}
```

상대 경로만 저장한다. Content scan과 같은 정책으로 `.git`, `.obsidian`, `node_modules`, 설정된 제외 경로와 symlink를 제외한다. root와 탐색한 모든 디렉터리를 읽은 경우에만 scan을 완료로 본다. 탐색 중 오류가 있으면 scan이 불완전한 것이므로 삭제를 추론하지 않는다.

기존 설치에 inventory가 없으면 첫 번째 완전한 로컬 scan으로 초기화한다. 초기 migration scan에서는 삭제를 추론하지 않아 첫 materialization 때 cloud 전용 폴더가 지워지지 않게 한다.

### Pending delete intent

Network I/O 전에 삭제 후보를 저장한다.

```ts
type PendingDelete = {
  kind: 'markdown' | 'folder'
  path: string
  fileId: string
  operationId: string
  baseRevision: number
  expectedItemRevision?: number
  firstObservedAt: number
  attempts: number
}
```

같은 operation ID와 payload로 재시도한다. Pending 경로와 하위 항목은 병합한 cloud tree에서 제외한다. 승인된 뒤 durable cursor를 이동하기 전에 `remoteTrees`, `remoteFiles`, baselines와 local directory inventory에서 파일 또는 폴더 subtree를 제거한다.

## Server 동시성 guard

기존 `delete` operation을 사용한다. Markdown file은 대상의 현재 revision을 `expectedItemRevision`과 비교한다. Folder는 `baseRevision` 이후 폴더나 하위 항목이 바뀌었으면 원자적으로 거부한다. `file_changed_since_base`, `folder_changed_since_base`와 같이 안정적인 오류를 반환하고 일부만 삭제하지 않는다.

File 삭제는 대상 revision을 확인한다. 기존 operation row에는 변경된 path가 남지 않기 때문에 현재 Folder 삭제는 workspace revision이 요청한 base revision과 같아야 한다. 따라서 대상 subtree와 무관한 동시 변경도 안전하게 거부한다. Operation journal에 path를 기록한 뒤 subtree 범위만 확인하도록 좁힐 수 있다.

Stale revision conflict가 발생하면 pending delete를 취소하고 remote cursor를 따라잡는다. File은 최신 cloud version을 conflict copy로 보존한 뒤 재시도하거나 복원하고 `attention`으로 표시한다. Folder는 최신 cloud subtree를 로컬에 복원하고 폴더를 `attention`으로 표시한다. 복원된 항목에 최신 baseline이 생긴 뒤 사용자가 다시 삭제할 수 있다. 드문 경로지만 원격 편집 내용을 조용히 삭제하지 않도록 보존한다.

## Reconciliation 순서

1. **Watcher event는 신호로만 사용한다.** 변경 경로를 저장한다. `rename`, null filename, watcher 오류 또는 경로 누락은 directory 확인을 예약한다. callback 하나로 삭제 의도를 확정하지 않는다.
2. **Cloud hydration 전에 scan한다.** 원격 폴더를 만드는 loop 전에 로컬 directory scan을 완료한다. 같은 pass에서 로컬 Markdown 목록과 저장된 baseline을 대조한다. 어느 scan이든 실패하면 마지막 commit inventory를 유지하고 안전하게 중단한다.
3. **Migration에서 초기화한다.** 이전 inventory가 없으면 첫 완전한 inventory를 저장하고 일반 cloud hydration을 진행한다. 이 pass에서 delete intent를 만들지 않는다.
4. **File과 directory를 비교한다.** 사라진 Markdown path는 commit된 remote baseline이 있을 때만 후보가 된다. 사라진 directory는 이전 완전한 inventory에 있고 삭제되지 않은 remote folder record도 있을 때만 후보가 된다. Parent와 child가 모두 없으면 가장 상위 parent만 골라 server의 cascade delete에 맡긴다.
5. **제외 경로를 보호한다.** 후보가 제외 경로나 예약된 sync 경로와 겹치면 삭제를 추론하지 않는다.
6. **Directory 이동을 판별한다.** 안정적인 `(device, inode)` identity로 사라진 directory와 새 directory가 일치하면 recursive move 한 번을 보낸다. Identity가 없거나 모호하면 추측하지 않고 보수적인 delete/create로 처리한다.
7. **Intent를 저장하고 행을 숨긴다.** operation ID, item path, target ID, revision guard를 저장한다. 후보와 folder 하위 항목을 병합 tree에서 즉시 제외한다.
8. **원격에서 삭제한다.** 조건부 file 또는 folder delete를 요청한다. Revision guard가 통과할 때만 server가 file 또는 folder subtree를 원자적으로 tombstone한다.
9. **승인 뒤 commit한다.** cache metadata와 baseline을 정리하고 승인된 revision으로 cursor를 이동한다. 일시 오류라면 pending intent를 유지하고 path를 다시 만들지 않은 채 재시도한다.
10. **Stale-delete conflict를 해결한다.** 원격 변경을 반영하고 최신 cloud version을 보존 또는 복원한다. Pending delete를 정리하고 `attention`을 표시한다.
11. **놓친 event를 복구한다.** 시작 시와 주기적인 완전 scan에서 같은 inventory diff를 사용한다. Watcher drop이나 오류는 전체 directory scan을 발생시킨다.

| Condition                                          | Result                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| 이전 inventory 없는 첫 완전 scan                   | Inventory를 초기화하고 cloud 전용 folder를 materialize하며 삭제하지 않는다. |
| 완전 scan에서 baseline Markdown file 누락          | 조건부 file delete를 queue에 넣는다.                                        |
| 이전에 확인한 folder가 완전 scan에서 누락          | 조건부 folder delete를 queue에 넣는다.                                      |
| Root 누락, 탐색 실패 또는 scan 미완료              | 이전 inventory를 유지하고 재시도하며 삭제하지 않는다.                       |
| 후보가 제외 또는 reserved 경로임                   | 삭제를 추론하지 않는다.                                                     |
| Remote file revision이 baseline과 일치             | File을 원자적으로 tombstone한다.                                            |
| Client cursor 이후 remote folder subtree 변경 없음 | Folder와 하위 항목을 원자적으로 tombstone한다.                              |
| Cursor 이후 remote file/subtree가 변경됨           | 원자적으로 거부하고 최신 cloud version을 보존/복원해 attention을 표시한다.  |
| 같은 directory identity가 새 경로에 나타남         | Move operation 한 번을 보낸다.                                              |
| Identity가 없거나 모호함                           | Move를 추측하지 않는다.                                                     |

## Tree 표시와 진단 기록

- Pending deletion은 Files tree에서 즉시 숨기고 stale cloud metadata가 다시 추가하지 못하게 한다.
- Operation 성공 후 기존 revision feed를 통해 모든 client에서 빈 folder 행을 제거한다.
- 원격 변경 conflict에서는 folder를 복원하고 attention 표시와 설명을 제공한다.
- Main-process log에는 note 내용을 넣지 않고 lifecycle event를 기록한다. 이벤트 이름은 `pkms_local_delete_queued`, `pkms_local_delete_ack`, `pkms_local_delete_conflict`, `pkms_local_delete_retry`, `pkms_local_folder_move`, `pkms_local_scan_incomplete`다. 가능한 경우 workspace ID, 상대 경로, item 종류, operation ID와 오류 메시지를 포함한다.
- Cloud folder deletion은 활성 remote tree에서 제거하고 local OS Trash로 옮긴 뒤 `pkms:local-tree:changed` event를 보내야 한다. 진단 event는 `pkms_remote_folder_delete_applied`이며 note 본문을 기록하지 않는다.

## Source·배포·수락 상태

| Slice                                                                 | Source status                                          | Operational status                           |
| --------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| 완전한 directory inventory와 초기화 전용 migration                    | `syncBridge.ts`에 구현됨                               | macOS watcher/drop/권한 수락 대기            |
| Durable file/folder delete intent와 tree 숨김                         | `syncBridge.ts`에 구현됨                               | 재시작/offline 응답 유실 확인 대기           |
| File revision 원자 검사와 보수적인 folder subtree guard               | Worker SQL migration과 handler에 구현됨                | 대상 DB에 migration 적용 여부 미확인         |
| Scan → remote cursor → 조건부 삭제 → 남은 folder materialization 순서 | 현재 `syncOnce`에 구현됨                               | 동시 삭제 end-to-end 확인 대기               |
| 안정적 directory identity 이동                                        | `(dev,ino)`로 목적지를 유일하게 찾을 때 구현됨         | 다른 volume/identity 부재 fallback 수락 대기 |
| 구조화된 lifecycle log                                                | queued/ack/conflict/retry/move/incomplete event를 기록 | log 전달·보존·개인정보 검토 대기             |

Migration 파일과 source 구현만으로 운영 DB가 보호됐다고 볼 수 없다. 삭제 동작을 수락 처리하기 전에 DB migration version과 runtime evidence를 확인한다.

Folder materialization을 끄는 방식으로 해결하지 않는다. 원격에만 있는 폴더와 빈 cloud 폴더도 로컬에 보여야 한다. Bridge는 폴더를 다시 만들기 전에 해당 폴더가 로컬에서 실제로 사라졌는지 판단한다.

## 수락 기준

1. Finder에서 동기화 중인 Markdown file을 삭제하면 disk와 PKMS tree에서 사라지고 cursor poll 두 번과 restart 뒤에도 다시 나타나지 않는다.
2. 동기화 중인 빈 folder를 삭제해도 결과를 durable하게 유지한다.
3. 내용이 있는 folder 삭제는 recursive operation 한 번만 보내고 하위 항목별 삭제 요청을 만들지 않는다.
4. Offline 중 file/folder 삭제는 숨김과 pending 상태를 유지한다. 재연결 후 같은 operation ID로 재시도하며 cache metadata로 항목을 되살리지 않는다.
5. 로컬 cursor 이후 remote file 또는 하위 항목이 편집되면 삭제를 원자적으로 거부한다. 최신 cloud version을 보존하고 attention으로 표시한다.
6. 불완전하거나 읽을 수 없는 file/directory scan은 cloud 삭제를 일으키지 않는다.
7. 제외 경로는 부재만으로 삭제하지 않는다.
8. macOS directory rename에서 inode identity가 안정적으로 유지되면 move 하나를 사용하고 conflict copy를 만들지 않는다.
9. 빈 로컬 folder와 내용이 있는 cloud tree의 최초 sync는 inventory를 초기화하고 remote tree를 materialize한다.
10. Upload 전에 생성했다 삭제한 로컬 전용 Markdown file은 pending-create queue에서 제거하고 원격에 나타나지 않는다.
11. Pending-delete 각 단계에서 restart해도 같은 operation을 재시도하거나 완료하고 stale 항목을 되살리지 않는다.
12. Log는 문서 내용을 포함하지 않고 후보, 승인, 재시도, conflict와 scan 미완료를 식별한다.
13. 연결된 local root를 바꿔도 새 root에 없다는 이유만으로 remote 항목을 삭제하지 않는다. Migration/초기화에는 명시적 확인과 새 root의 완전한 inventory가 필요하다.

## 조사 근거

- Node.js의 `fs.watch()` 동작은 플랫폼마다 다르고 filename이 누락될 수 있으며 rename 알림만으로 durable operation journal을 만들 수 없다. Event를 진실로 간주하지 말고 scan으로 확인한다. [Node.js `fs.watch()`](https://nodejs.org/api/fs.html#fswatchfilename-options-listener)
- Apple File Provider는 durable synchronization point 이후 변경을 열거하기 위해 synchronization anchor를 사용한다. 완전하고 승인된 pass 뒤에만 inventory와 cursor를 commit하는 설계 근거가 된다. [Apple `NSFileProviderSyncAnchor`](https://developer.apple.com/documentation/fileprovider/nsfileprovidersyncanchor), [File Provider 변경 추적](https://developer.apple.com/documentation/fileprovider/tracking-your-file-provider-s-changes)
- macOS FSEvents는 event drop 상황을 알려주며 이 경우 recursive rescan이 필요하다. Node watcher 추상화는 항목별 durable 삭제 journal을 제공하지 않으므로 복구에는 주기적인 inventory reconciliation이 필요하다. [Apple FSEvents dropped events](https://developer.apple.com/documentation/coreservices/kfseventstreameventflaguserdropped)

이 플랫폼 API를 근거로 PKMS가 File Provider를 도입해야 한다고 결론 내리지 않는다. 여기서 적용한 원칙은 event가 engine을 깨우고 durable inventory와 revision cursor가 사실을 확인한다는 것이다.
