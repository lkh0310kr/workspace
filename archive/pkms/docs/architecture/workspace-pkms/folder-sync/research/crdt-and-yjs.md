# CRDT와 Yjs 동기화 연구

## 목적과 조사 범위

PKMS는 Markdown 본문을 Yjs document로 보관한다. 이 문서는 CRDT의 수렴 조건과 Yjs의 공개 update API를 기준으로 본문 동기화와 파일/경로 동기화의 경계를 정리한다. CRDT가 folder sync 전체를 자동 해결한다고 가정하지 않는다.

## 연구 결과

- CRDT 이론은 비동기 복제 상태/연산의 병합이 수렴하도록 필요한 조건을 형식화한다. replicas가 같은 updates를 적용하면 같은 상태가 되는 성질은 전송 재시도·순서 변경에 강한 기반이다. [Shapiro et al., Conflict-free Replicated Data Types, 2011](https://perso.lip6.fr/Marc.Shapiro/papers/2011/CRDTs_SSS-2011.pdf)
- Yjs document updates는 commutative, associative, idempotent이다. 따라서 같은 update를 반복 적용하거나 순서를 바꿔 적용해도, 모든 update를 받은 replicas는 수렴한다. Yjs state vector는 상대가 가진 상태 이후의 차이를 보낼 수 있게 한다. [Yjs: Document Updates](https://docs.yjs.dev/api/document-updates)
- Yjs update는 문서 내부 본문 변경 표현이다. 파일 path, 폴더 생성/삭제, 사용자 의도, 서버 권한, 로컬 파일의 외부 수정/삭제를 결정하지 않는다. 이들은 별도 메타데이터 protocol 및 filesystem reconciliation 대상이다.
- Yjs의 binary update를 병합하는 API는 update 중복을 제거할 수 있지만, 이 경로만으로는 삭제된 content를 garbage collect하지 않는다. 문서 자체를 로드하는 compaction 정책은 별도다. [Yjs: Document Updates](https://docs.yjs.dev/api/document-updates)

## PKMS 적용 경계

| 데이터 종류                     | 일관성 도구                                           | 반드시 별도로 보장할 것                                                               |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Markdown 본문 변경              | Yjs update/state vector, server revision guard        | operation ID 영속화, ACK 유실 후 멱등 재전송, 본문 hash·revision 확인, conflict UX    |
| 이름/path/move                  | PKMS operation API와 stable file ID                   | 두 path 변경의 원자성, 기존·신규 부모 metadata 갱신, concurrent move/delete 처리      |
| 폴더/빈 폴더                    | PKMS tree metadata 및 revision                        | subtree delete guard, empty folder 표현, inventory 누락을 delete로 오인하지 않는 처리 |
| 로컬 filesystem materialization | baseline/hash, atomic replace, OS watcher + full scan | 외부 편집기와 경합 검사, 앱 재시작 복구, 손상/권한/용량 부족 처리                     |
| Cloud ↔ GitHub export           | 별도 export transaction과 Git SHA                     | folder sync 완료와 backup 완료를 다른 상태로 표시                                     |

## 동기화 원칙

1. Yjs update와 filesystem operation을 하나의 작업으로 간주하지 않는다. 본문이 수렴해도 rename/delete/tree metadata가 남을 수 있다.
2. 임의 순서/중복 update 적용이 가능한 점은 전송 retry에 쓰되, operation ACK 손실은 operation ID와 server dedupe로 다룬다.
3. Sync completion은 update 수신, HTTP 2xx, Realtime event가 아니라 본문과 metadata를 반영한 revision 및 남은 durable intent로 정의한다.
4. 서로 다른 경로의 같은 이름 파일은 identity 충돌이다. 같은 path의 상이한 본문은 conflict-preserve 규칙으로 해결한다. Yjs 본문 CRDT가 filesystem 이름 충돌을 선택하지 않는다.
5. Update compaction/garbage collection과 version history retention은 sync reliability와 분리된 저장 수명주기 스펙으로 관리한다.

## PKMS 설계/검증 요구

- 두 독립 Y.Doc에서 동시에 edit 후 update 순서를 바꾸고 중복 전달하는 test를 둔다. 최종 markdown text와 state vector가 양쪽에서 일치해야 한다.
- 같은 operation ID를 같은 payload로 반복하면 기존 결과를 반환하고, 같은 ID에 다른 payload를 주면 명시 오류가 나야 한다.
- ACK를 잃은 뒤 앱과 server를 재시작해도 Yjs body, file ID/path, revision이 하나로 수렴해야 한다.
- 서로 다른 operation을 같은 `fileId`에 경쟁 적용해 conflict, delete, move 결과가 API contract와 같은지 server SQL/API test로 확인한다.
- Yjs 테스트만 통과해도 local folder parity 또는 GitHub mirror 완료로 표시하지 않는다.

## 출처

- Marc Shapiro, Nuno Preguiça, Carlos Baquero, Marek Zawirski, [Conflict-free Replicated Data Types, 2011](https://perso.lip6.fr/Marc.Shapiro/papers/2011/CRDTs_SSS-2011.pdf)
- Yjs Documentation, [Document Updates](https://docs.yjs.dev/api/document-updates)
- Martin Kleppmann et al., [Local-first software: You own your data, in spite of the cloud](https://martin.kleppmann.com/papers/local-first.pdf)
