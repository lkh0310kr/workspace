# Folder sync UI 결과·수락 시나리오

UI는 내부 queue 구조를 노출하는 대신 사용자가 선택할 행동과 자료 보존 상태를 알려야 한다. UI contract와 현재 UI 차이를 구분한다.

## User-observable states

| 결과 상태 | 의미 | 필요한 사용자 정보/행동 |
|---|---|---|
| 연결 안 됨 | local root와 remote workspace를 sync하지 않음 | 연결 가능한 workspace 선택, local directory 결정 |
| 확인 중 | watcher/poll/scan 또는 remote metadata 확인 중 | tree를 계속 사용할 수 있어야 함. 빈 목록으로 깜박이거나 완료라고 말하지 않음 |
| 변경 대기/전송 중 | local/remote mutation이 미승인 | 영향 item과 방향을 설명할 수 있어야 함 |
| 최신 확인 | 마지막 pass에서 처리할 변경이 없어 완료 | “현재 확인 시점 기준”임을 표시. 다른 기기 전체 동시 확인이나 GitHub backup 완료를 뜻하지 않음 |
| 오프라인/권한 실패 | server에 접근할 수 없거나 로그인/권한이 거부됨 | pending local 변경을 보존하고 재인증/연결 복구 경로를 제공 |
| 충돌/주의 필요 | 자동 결정 시 한쪽 변경이 사라질 수 있음 또는 실패 item이 있음 | 보존된 버전, 대상 path, 가능한 검토/재시도 행동을 제공 |
| 제외 | 사용자가 특정 path를 sync에서 제외함 | exclusion에 해당하는 local 변경을 cloud deletion으로 오인하지 않음 |

`pending`, `syncing`, `attention` 같은 source enum을 사용자 용어에 그대로 노출할 필요는 없다. 단 `error/offline`을 `synced`와 합치거나 실제 0 pending으로 바꾸면 안 된다.

## Tree와 세부 상태

- Files tree는 sync 중에도 탐색 가능하고 local path를 즉시 보여준다.
- local-only 파일/폴더는 첫 remote acknowledgement 전까지 대기 상태다.
- cloud-only folder/file은 metadata를 통해 표시할 수 있다. Markdown body materialization 전에도 빈 tree처럼 보이지 않는다.
- synced item은 기본적으로 badge를 생략해 tree noise를 줄일 수 있다.
- conflict copy는 사용자가 찾고 열어 원문과 보존본을 비교할 수 있어야 한다. 임의 자동 merge 성공처럼 표시하지 않는다. **현재 panel은 conflict path 일부를 텍스트로만 나열하며 바로 여는 action은 확인되지 않았다.**
- failed item은 나머지 sync를 막지 않되 사용자에게 attention과 retry/fix를 알린다.
- 폴더 aggregate 상태를 제공하는 경우 가장 중요한 descendant state를 표시한다. child 수만큼 중복 경고를 띄우지 않는다.
- GitHub backup 상태는 cloud folder sync 상태와 별도 표시한다.

전체 percent는 대상 집합이 달라지면 감소/증가할 수 있어 안정된 결과를 뜻하지 않는다. 고정 revision에 묶인 initial materialization만 필요하면 그 snapshot 기준임을 표시한다. 현재 settings panel은 sync pass의 `completed/total` percent를 보여줄 수 있으므로 product acceptance에서 값이 단조 진행 또는 안정된 진행률이라는 오해가 없는지 확인해야 한다.

## Acceptance matrix

| ID | Given / when | 사용자가 확인해야 할 결과 | 상태 |
|---|---|---|---|
| FS-UI-01 | 첫 연결 중 local files와 cloud metadata가 존재 | tree는 사용 가능하고 빈 상태/완료로 오해되지 않는다 | source review, 통합 미확인 |
| FS-UI-02 | local file 생성/수정/삭제 | 해당 item에 필요한 상태가 보이고 acknowledgement 전 premature synced가 아니다 | item state 일부 transient, full acceptance 미확인 |
| FS-UI-03 | offline 중 변경 후 reconnect | 변경은 사라지지 않고 재시도 결과가 보인다 | 구현 경로, restart/offline test 미확인 |
| FS-UI-04 | 양쪽에서 동시 수정 | conflict copy와 원본 모두 검토 가능하고 어느 쪽도 조용히 유실되지 않는다 | conflict path 생성 source 확인; one-click open UX·cross-device 미확인 |
| FS-UI-05 | 파일 한 개가 permission/format/error에 걸림 | 다른 file/tree는 계속 사용할 수 있고 문제 item만 attention에 남는다 | source-level 일부, UI fixture 미확인 |
| FS-UI-06 | GitHub mirror 지연, cloud sync 완료 | 두 상태를 구분해 표시한다 | current panel source 확인, 수동 fixture 미확인 |
| FS-UI-07 | path가 excluded/reserved | local tree 보존과 cloud deletion 여부가 명확하고 의도하지 않은 delete가 없다 | algorithm/source, edge fixtures 미확인 |
| FS-UI-08 | 연결 해제 또는 root 변경 | 다음 pass에 어떤 local/cloud 자료가 보존되는지 사전/사후 알 수 있다 | product decision/acceptance 미완료 |
| FS-UI-09 | sync panel 닫고 재열기 | stale response가 최신 상태를 덮지 않고 진행 상태가 다시 읽힌다 | UI lifecycle fixture 미확인 |
| FS-UI-10 | initial full sync와 새 작업이 동시에 진행 | 진행 숫자/문구가 고정되지 않은 전체 퍼센트를 안정적 의미처럼 표현하지 않는다 | current percent presentation review needed |

## Current UI mapping

`PkmsSyncBridgeStatus`의 top-level state는 `disconnected | syncing | synced | offline | error`, stage는 `scanning | loading-remote-list | downloading-remote-files | reconciling`이다. item map은 현재 `pending | syncing | attention`만 표현한다. status/pending path는 부분적으로 memory/durable 혼합이며 persistent per-item final state가 아니다.

`SyncBridgePanel`은 bridge status를 5초마다 다시 읽고 aggregate progress를 percent로 그린다. 화면에서 state label, last sync time, pending count, folder path, excludes와 GitHub backup action이 별도 표현된다. 5초는 현 구현값이지 제품의 freshness 요구가 아니다. UI가 보여주는 `Up to date`는 local pass 상태이지 모든 remote replica·GitHub가 일치함을 증명하지 않는다.

## 수동·통합 검증 세트

1. 첫 연결에서 offline→online 전환, remote folder metadata가 늦게 도착해도 local tree가 비지 않음.
2. 같은 Markdown의 local/remote concurrent edit, 삭제 직전 remote edit, folder subtree concurrent change.
3. row-level waiting/attention, 재시도 후 badge clear, conflict copy open, excluded path.
4. server GitHub backup pending/failed와 folder sync `synced`의 동시 표시.
5. settings close/reopen, workspace 전환, 오래된 HTTP response 지연 도착.
6. 대량 초기 sync 중 새 파일 생성/삭제와 퍼센트 표시.

실행 결과는 OS·server migration·fixture 버전을 기록한다. 코드 존재만으로 UI acceptance를 통과 처리하지 않는다.
