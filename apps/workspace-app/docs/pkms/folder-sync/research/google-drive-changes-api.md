# Google Drive 변경 피드 동기화 연구

## 목적과 조사 범위

이 문서는 Google Drive API v3의 공개 `changes` 및 `changes.watch` 계약을 조사한다. Drive API의 공개 표면에 한정하며 Google 내부 동기화 알고리즘을 추정하지 않는다.

## 공개 프로토콜

### 페이지 토큰과 cursor

1. `changes.getStartPageToken`으로 현재 상태 경계 토큰을 받는다.
2. `changes.list`에 저장한 토큰을 전달해 변경을 순서대로 읽는다. 페이지가 남으면 `nextPageToken`으로 이어서 읽는다.
3. 마지막 페이지에 도착했을 때만 `newStartPageToken`을 다음 polling cursor로 영속화한다.
4. 삭제/접근 제거도 `includeRemoved` 설정으로 feed에 포함할 수 있다.

Google 문서에서 `nextPageToken`은 이어 읽기 토큰이고 `newStartPageToken`은 feed 끝에서 이후 변경을 이어 읽을 새 시작 토큰이다. 페이지 중간 token을 최종 cursor로 취급하면 변경을 건너뛸 수 있다. [Google: Retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes), [Google: changes.list reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list)

### Push 알림

`changes.watch` 알림은 변경 metadata/body가 아닌 “변경 확인 필요” 신호다. 클라이언트는 실제 내용을 얻기 위해 `changes.list`를 호출한다. 알림에는 채널 ID/resource ID 및 선택적 token이 있어 라우팅·출처 확인에 쓸 수 있다. 채널은 만료되며 자동 갱신되지 않으므로 새 unique channel을 만들고 교체해야 한다. 중복·누락·순서 비연속 메시지를 정확한 change log로 오인하지 않는다. [Google: Notifications for resource changes](https://developers.google.com/workspace/drive/api/guides/push)

## PKMS에 적용할 수 있는 결과 원칙

| 원칙 | PKMS에서 요구할 결과 | 현재 확인된 간극 |
|---|---|---|
| durable cursor는 끝 페이지에서만 전진 | 모든 페이지·mutation 처리가 성공하기 전 cursor는 이전 값 또는 재시작 가능한 in-flight 값으로 남는다. | revision cursor를 pass 마지막에 저장하는 구조는 있으나 중간 페이지/다운로드/write/저장 실패 지점별 crash test가 없다. |
| notification은 wake-up | Realtime 메시지는 빠른 반응만 유도하고, revisioned feed가 실제 변경을 제공한다. 누락 시 polling이 결국 복구한다. | 현재 Realtime + 30초 poll 구조. 중복·유실·순서 역전 재생 fixture가 없다. |
| pagination 경계 고정 | 여러 페이지는 같은 captured revision/snapshot에 속해야 한다. 페이지 사이 신규 mutation이 기존 목록에서 누락/중복되지 않는다. | `sync/tree`의 captured revision pagination이 있지만 page boundary consistency 통합 검증은 확인되지 않았다. |
| cursor 복구 경로 | invalid/unsupported cursor 또는 server schema migration mismatch는 cursor 초기화 후 authoritative snapshot으로 복구하며, 기존 local data를 삭제 근거로 삼지 않는다. | legacy endpoint fallback은 있지만 error class 기반 recovery matrix와 자동 regression이 약하다. |
| 삭제·권한 손실 구분 | deleted, unshared, inaccessible 결과를 한 가지 “file missing”으로 뭉개지 않고 제품 정책에 연결한다. | PKMS deletion tombstone은 구분되나 access/revocation 시나리오가 acceptance에 제한적으로만 반영됐다. |

## 프로토콜 차이와 한계

Google Drive `pageToken`은 API가 발급하는 opaque token이며 PKMS의 정수 revision cursor와 wire-compatible하지 않다. 가져와야 할 것은 cursor의 **수명주기**(페이지 완료 전 확정 금지), wake-up과 source-of-truth feed 분리, 채널 만료 관리다. PKMS는 server가 제공하는 monotonic revision과 captured snapshot을 계속 사용하되 이를 명시적인 cursor contract로 테스트해야 한다.

## 설계/QA 요구로 변환

- `syncCursor`를 단순 숫자에서 `{ committedRevision, inFlightSnapshotRevision, schemaVersion }`로 발전시킬지 검토한다. 마이그레이션 전에는 현재 JSON 상태를 보존하는 migration이 필요하다.
- feed 페이지를 읽는 중 앱 종료, 서버 오류, 중복 wakeup, 다음 page 응답 유실, cursor 저장 직전 종료를 fault injection으로 재현한다.
- 각 실행 후 단 하나의 최종 조건을 검사한다: local manifest, authoritative cloud snapshot, cursor revision이 수렴하고 pending operation이 0이거나 사용자에게 남은 이유가 표시된다.
- poll은 correctness 경로로 유지한다. realtime 연결 여부를 “동기화 완료”와 같은 말로 보여주지 않는다.

## 출처

- Google for Developers, [Retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- Google for Developers, [Method: changes.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list)
- Google for Developers, [Notifications for resource changes](https://developers.google.com/workspace/drive/api/guides/push)
