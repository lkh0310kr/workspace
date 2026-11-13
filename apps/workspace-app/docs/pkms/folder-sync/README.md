# PKMS Desktop folder sync 스펙

이 문서군은 연결된 로컬 폴더와 PKMS workspace 사이의 결과 계약, 충돌·복구 규칙, 현재 wire contract를 소유한다. 일반 파일시스템 편집기와 PKMS pane은 같은 materialized 파일을 사용한다. GitHub backup은 cloud sync와 독립적이다.

## 목표 결과

- 사용자는 연결 폴더의 로컬 파일을 즉시 탐색하고 편집할 수 있다. 초기·재연결 sync 완료를 기다리지 않는다.
- 로컬 Markdown 생성·수정·이동·삭제와 원격 변경은 수렴하며, 동시 수정은 어느 쪽도 조용히 덮어쓰지 않는다.
- 실패·offline·앱 재시작 후 대기 작업은 중복 mutation이나 stale 항목 부활 없이 재개된다.
- 삭제는 확인된 부재와 해당 cloud baseline이 있을 때만 전파한다. 불완전 scan, 제외 경로, 초기 materialization은 삭제 근거가 아니다.
- 사용자는 대기·진행·충돌·주의 필요 상태와 조치할 위치를 알 수 있다. 충돌 복사본을 열어 두 버전을 검토할 수 있다.
- 한 item의 실패는 무관한 경로의 진행을 막지 않는다. 안전한 경로 복구가 불가능하면 데이터 보존 쪽으로 실패한다.
- `synced`는 현재로서는 해당 reconciliation pass가 완료됐다는 뜻이다. 모든 기기 동시 확인이나 GitHub mirror 완료를 뜻하지 않는다.
- Disconnect 또는 root 변경만으로 cloud content를 삭제하지 않는다. 새 root는 이전 root와 동일하다고 증명되기 전에는 별도 local identity로 다룬다.

## 문서 지도

| 문서 | 계약 |
|---|---|
| [Reconciliation과 충돌](./reconciliation.md) | baseline 기반 파일 비교, tree/cursor, 동시 수정과 파일 적용 |
| [Durability와 복구](./durability-recovery.md) | 저장 상태, watcher/scan, queue, retry, offline/restart/disconnect |
| [Server protocol](./server-protocol.md) | route, pagination/cursor, operation idempotency, 오류/revision guard |
| [UI 결과와 acceptance](./ui-acceptance.md) | tree·설정의 사용자 상태, 결과 기반 시나리오, 검증 evidence |
| [삭제·폴더 이동](./deletion.md) | inventory 기반 안전 삭제, recursive guard, 이동과 삭제 충돌 |
| [현재 구현과 rollout 상태](./implementation-status.md) | 코드상 값/한계, migration 및 미검증 구분 |
| [동기화 기술 연구와 개선 설계](./research/README.md) | Apple File Provider/iCloud, Google Drive change feed, CRDT/Yjs의 공개 contract와 PKMS 개선 요구 |

## 범위·소유 경계

- Desktop Main: 로컬 root 권한, 파일 감시/쓰기, durable queue/baseline/cursor, PKMS API proxy.
- PKMS Server + Supabase: workspace 권한 확인, revisioned file/folder metadata, operation identity, Yjs update, conditional mutation.
- `pkms-client`: sync 설정 UI와 bridge API 소비. local filesystem과 Main bearer token은 소유하지 않는다.
- GitHub export: 서버의 별도 backup state. 이 sync가 GitHub에 반영됐음을 보장하지 않는다.
- 현재 bridge가 동기화하는 content는 Markdown과 folder metadata다. binary attachment의 local mirror는 이 계약 범위에 포함되지 않는다.
- Files tree와 quick open은 이름이 `.`으로 시작한다는 이유만으로 Cloud 항목을 숨기지 않는다. Local folder sync는 `.git`, `.obsidian`, `node_modules`와 사용자가 설정한 제외 경로를 scan/materialization에서 제외한다. `.pkms`는 별도 예약 경로가 아니며 다른 dot-folder와 동일하게 취급한다. 기존 Cloud 항목이 보이는 것과 local mirror 대상인지는 다를 수 있다.

## 신뢰 순서

제품 결과와 필수 불변식은 reconciliation/삭제 문서가 규범 기준이다. wire/API 의미는 server protocol이 기준이다. 구현의 timer, 동시성 수치, storage layout은 [현재 구현](./implementation-status.md)에 적고 목표 계약과 섞지 않는다. 배포 완료는 migration/runtime acceptance 기록이 있어야 한다.

## 우선 안전 이슈

`configurePkmsSyncBridge` now clears the prior root's baselines, remote caches, cursor, local directory inventory, and pending deletion intents before starting the new root's full pass. That prevents the known `local absent + remote present + old baseline` path from submitting cloud deletes. The new root must fetch an authoritative snapshot and materialize remote Markdown before local-only content is imported. This source fix has policy unit coverage; a temporary-directory/fake-server reconciliation test is still required before marking root-switch acceptance complete. The detailed contract is in [sync research](./research/README.md).

진입 근거: [Main bridge](../../../src/main/pkms/syncBridge.ts), [PKMS vault handler](../../../../pkms-server/src/SupabaseVault.ts), [sync migrations](../../../../pkms-server/supabase/migrations), [Desktop bridge status type](../../../src/shared/pkmsSyncBridge.ts), [설정 패널](../../../../../packages/pkms-client/src/components/SyncBridgePanel.tsx).
