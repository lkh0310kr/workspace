# 동기화 기술 조사와 PKMS 설계

## 조사 문서

| 기술 | 공개한 contract에서 확인한 패턴 | PKMS 적용 경계 |
|---|---|---|
| [Apple iCloud/File Provider](./apple-icloud-file-provider.md) | sync anchor, metadata/materialized item, 파일 coordination, conflict 시 local change 보존 | OS 제공 기능을 기대할 수 없으므로 Desktop이 직접 filesystem race와 durable intent를 처리 |
| [Google Drive changes API](./google-drive-changes-api.md) | 순차 페이지 토큰, 최종 페이지에서 cursor 전진, 알림은 wake-up, 만료되는 watch 채널 | revision cursor 및 snapshot 기반으로 재해석. Google token/wire format은 복사하지 않음 |
| [CRDT/Yjs](./crdt-and-yjs.md) | 본문 update의 중복·순서 변경 허용, state vector 기반 차이 전달 | 본문 convergence에 한정. path/tree/delete/filesystem conflict는 PKMS operation contract가 소유 |

## 공통 결론

세 기술 모두 “한 번의 파일 복사”를 sync로 정의하지 않는다. 안정된 ID/version/change anchor를 가지고, 변경을 재시도해도 결과가 하나로 수렴하며, 부분 적용 뒤 재시작해도 마지막 확정 지점부터 다시 처리하고, 충돌/오프라인/대기 작업을 사용자가 구분할 수 있어야 한다.

PKMS가 보장해야 하는 결과:

1. 어느 replica에도 아직 확정되지 않은 변경은 삭제하지 않는다.
2. cursor는 해당 cursor가 의미하는 모든 페이지/변경의 적용이 성공한 뒤에만 확정한다.
3. 알림은 낮은 지연을 위한 힌트다. poll/change feed와 authoritative snapshot이 최종 복구 경로다.
4. remote 변경을 local에 쓸 때 예상 local version이 바뀌었다면 적용을 중단하고 양쪽 버전을 보존한다.
5. local root, workspace, cloud item ID를 별도 identity로 다룬다. root 변경은 baseline 재사용이나 mass delete 근거가 될 수 없다.
6. 본문·경로·폴더·GitHub backup을 서로 다른 상태로 추적한다.
7. sync 완료는 사용자에게 확인 가능한 정확한 revision, 남은 로컬 변경/충돌/오류와 함께 표현한다.

## 사용자 경험 계약 제안

| 사용자가 보는 상태 | 필요한 의미 | 행동 |
|---|---|---|
| 확인 중 | 로컬/원격 변경을 발견하고 현재 revision까지 검사 중 | Files tree 계속 탐색 가능. 빈 tree나 완료 문구를 보여주지 않음 |
| 기기에 저장됨 · 업로드 대기 | 로컬 변경은 안전하게 저장됐지만 Cloud ACK 전 | 앱 종료/오프라인에도 유지됨을 표시; 재시도 시점/상태 확인 |
| 최신 확인 · revision N | N까지의 Cloud feed를 적용했고 현재 durable queue는 0 | 마지막 확인 시각과 GitHub backup 별도 상태 |
| 다운로드/변경 적용 중 | Cloud 변경을 로컬 파일에 반영하는 중 | 현재 파일이 편집 중이면 안전하게 대기하거나 conflict-preserve |
| 충돌 검토 | 둘 이상의 내용/경로 변경이 보존됨 | 원본·보존본 열기, path/revision/발생 시각을 표시 |
| 연결 문제 | 인증·권한·오프라인·서버 오류로 progress 불가 | 대기 변경 유지, 원인과 재시도/재인증 행동 제공 |
| 로컬 폴더 변경 확인 | 새 root는 별도 replica identity | Cloud 내용을 먼저 materialize하고 local-only 변경은 별도 import; 연결만으로 Cloud 삭제 금지 |

완료 상태를 spinner 종료나 단순 100%로 결정하지 않는다. 정확성 관점에서 `confirmed cloud revision`, `durable local intent count`, `blocked/conflict count`, `last successful pass`를 추적한다. 화면은 파일 개수 기반 퍼센트가 가변이면 완료율로 과장하지 않고 단계/상태를 보여준다.

## 지속 QA 구성안

### 자동화 층

1. **Pure policy unit tests**: root 전환, baseline identity, delete guard, cursor commit rule, conflict classification.
2. **Sync engine integration**: 임시 디렉터리 + fake PKMS API. Cloud tree, local manifest, persisted bridge state를 매 pass 끝에 비교한다.
3. **Fault-injection suite**: 각 durable write/API boundary에서 process crash, timeout, lost ACK, duplicate/out-of-order event, partial page, disk full/permission failure 주입 후 재시작한다.
4. **Server contract tests**: API route와 Supabase transaction을 test DB에서 수행. idempotency, revision guard, move/delete race, cursor snapshot 일관성을 검증한다.
5. **Packaged Electron smoke/E2E**: 별도 temporary userData/root에서 reconnect, restart, progress/error/conflict UI를 검증한다. 사용자의 실제 PKMS 폴더를 fixture로 쓰지 않는다.
6. **Scheduled scale/recovery QA**: 대량 tree, 서버 migration/version skew, 장시간 offline 후 복구 및 manifest hash parity를 확인한다.

### CI 게이트와 지속 회귀

- PR: formatter/lint/typecheck + sync unit/integration + server SQL contract suite. 실패 시 배포하지 않는다.
- Main/nightly: fault-injection restart matrix, Electron packaged smoke, 대량 tree 성능 기준, sync 관련 non-flaky regression 재실행.
- 실패 artifact: test seed, OS/runtime, server schema/migration revision, local/cloud manifest, baseline/cursor, pending operation 목록, event trace를 저장한다. 본문 전체나 bearer token은 로그에 기록하지 않는다.
- 테스트는 property invariant를 중심으로 한다: no silent data loss, retry converges, cursor never skips uncommitted change, independent workspaces don't affect each other, completion implies zero unresolved durable work.

## 단계적 구현 우선순위

| 순서 | 결과 | 성공 기준 |
|---|---|---|
| P0 | root 변경이 이전 baseline으로 cloud delete를 만들지 않음 | empty/new root 연결 fixture에서 기존 Cloud tree/hash 불변, 새 root local content 보존 |
| P0 | deterministic fake-server sync integration suite | local/cloud/file identity/revision/pending queue parity 자동 판정 |
| P1 | cursor + idempotent mutation crash recovery matrix | 모든 crash point 뒤 재시도 결과가 단일 item/revision으로 수렴 |
| P1 | sync UI 의미/문구 개선 | persisted pending, last confirmed revision, per-item conflict/retry를 UI에서 확인 |
| P2 | CI 지속 실행과 scheduled packaged smoke | PR gate + nightly 결과/artifact 보존 |
| P2 | 성능 계측/최적화 | tree 규모별 scan/download/write latency 기준과 회귀 경보 |

## 결정 전 조사/설계 이슈

- 새 root 연결에서 자동으로 Cloud 본문을 내려받은 다음 local-only 파일을 올릴지, 사용자가 `Cloud 내용을 받기`/`이 폴더를 가져오기`를 선택하게 할지. 어떤 선택이어도 implicit remote delete는 금지한다.
- 폴더 sync를 별도 Electron 프로세스/서비스로 분리하거나 OS File Provider를 채택할지. 우선 현재 구현에서 위 안전 계약과 측정치를 확보한 뒤 비용 대비 검토한다.
- 현 status JSON에 schema version과 migration/recovery report를 넣고, corrupt state를 empty로 조용히 대체하지 않고 손상본을 보존하는지.
- history/garbage collection과 GitHub mirror는 folder sync completion과 분리된 retention/backup policy로 둘 것.
