# Storage Abstraction: Supabase와 Android Data Node를 교체할 수 있는가?

조사일: 2026-11-08  
기준 구현: `apps/pkms-server/`, `apps/pkms-server/supabase/`

## 결론

**가능하다.** 단, 같은 몇 개의 메서드를 구현하면 backend를 즉시 갈아 끼울 수 있는 수준의 “얇은 adapter”는 아니다. 현재 PKMS가 요구하는 것을 capability별 계약으로 분리하고, Supabase 구현과 Android 구현이 같은 의미를 제공하는지 검증해야 한다.

권장 개념은 `DataNode`라는 단일 큰 인터페이스보다는 아래의 교체 가능한 ports다.

```text
PKMS app → Worker (일반 API, auth, PKMS domain logic)
                   ├─ MetadataStore  ── Supabase/Postgres 또는 Android SQLite node
                   ├─ ObjectStore    ── Cloudflare R2 또는 Android filesystem node
                   ├─ RealtimeBus    ── Supabase Realtime 또는 대체 WebSocket relay
                   └─ BackupPublisher ── GitHub batch commit/export
```

이 구조에서 앱은 backend 구현을 몰라도 되고, Worker는 PKMS API와 규칙을 소유하며, 저장 adapter는 PKMS 개념을 몰라도 된다. Android와 Supabase가 완전히 동일한 운영 특성까지 갖는다는 뜻은 아니다. 호출자의 관점에서 필요한 결과와 실패 의미를 같게 만드는 것이다.

## “범용 트랜잭션 DB”를 이 코드에 대입하면

DB는 관련 데이터를 하나의 원자적 단위로 기록해야 한다. 현재 문서 편집 경로에서 Yjs update를 받아들이면 DB는 다음을 맞춰 기록한다.

- `operation_id`가 이미 처리됐는지 확인해 중복 제출을 멱등 처리
- workspace/file revision 증가
- 새 Yjs update log 저장
- 현재 Markdown content/size 반영
- file의 dirty 상태 갱신
- workspace GitHub flush 상태/예정 시간 갱신

이 동작은 [migration의 `pkms_append_document_update`](../../../apps/pkms-server/supabase/migrations/20261101130000_atomic_document_write.sql) 한 DB 함수에서 수행된다. 이것들이 “트랜잭션 DB”의 예시이며 DB가 PKMS 비즈니스 API라는 뜻은 아니다. 다만 현재 migration function은 PKMS 의미와 SQL을 직접 포함하므로 adapter 경계 뒤로 옮기려면 이 명령의 의미를 명시적인 storage contract로 추출해야 한다.

Yjs 로그는 저장 데이터의 한 종류다. Realtime은 그 로그 자체가 아니라 다른 연결된 클라이언트에게 변경을 알려 주는 별도 전송 계층이다. 연결이 끊겼을 때는 DB의 update log/revision을 다시 조회해 회복할 수 있어야 하며, WebSocket broadcast를 durability 원천으로 삼으면 안 된다. Supabase 문서도 Broadcast를 connected clients로 보내는 메시지 경로로 설명하고, DB-backed replay는 보존 기간이 제한되어 있다. [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

## 현재 구현의 추상화 가능성

### 잘 분리할 수 있는 부분

1. **Object byte storage:** `R2Bucket.put/get/delete` 경계를 `ObjectStore`로 둘 수 있다. 현재 업로드는 스트림으로 R2에 쓰고, metadata commit 뒤 GitHub export가 끝나면 객체를 삭제한다. Android 구현은 private files 디렉터리에 같은 object key/hash semantics로 파일을 둘 수 있다.
2. **GitHub exporter:** 현재 blob/tree/commit/ref 처리 코드를 `BackupPublisher` adapter로 격리할 수 있다. 이 경계는 Android/Supabase adapter와 독립적이며, 일정 주기 batch export로 유지 가능하다.
3. **API DTO와 PKMS domain service:** Worker가 사용자 인증, path validation, file operation 및 response semantics를 유지할 수 있다. 클라이언트 API를 바꿀 필요가 없도록 내부 persistence port를 놓을 수 있다.
4. **Realtime:** 별도 `RealtimeBus.publish/subscribe` port로 분리 가능하다. Supabase Realtime을 계속 쓰거나 다른 relay로 갈아 끼울 수 있다.

### 가장 어려운 부분

`SupabaseVault.ts`는 DB transport와 PKMS domain logic이 섞여 있다. 파일 전반에 `supabaseRequest`, `supabaseRpc`, PostgREST query/filter string, PKMS 이름을 가진 RPC 호출이 직접 등장한다. 예를 들어 document read/write, directory mirror, operation, asset upload, dirty flush 및 recovery가 한 `SupabaseVault` 모듈에서 직접 Supabase를 호출한다. [SupabaseVault.ts](../../../apps/pkms-server/src/SupabaseVault.ts), [supabase.ts](../../../apps/pkms-server/src/supabase.ts)

DB contract가 너무 낮은 수준이면 Worker가 SQLite/Postgres 차이를 직접 알아야 하고, 너무 PKMS 전용이면 Data Node가 “범용 storage”가 아니라 PKMS backend가 된다. 적당한 경계는 Worker use case가 필요한 **원자적 명령 단위**를 선언하고, provider가 그 명령을 자기 DB transaction으로 구현하는 것이다.

예:

```ts
interface MetadataStore {
  applyWorkspaceOperation(input: OperationCommand): Promise<OperationResult>
  appendDocumentUpdate(input: DocumentUpdateCommand): Promise<AcceptedUpdate>
  readDocument(fileId: string): Promise<DocumentSnapshot>
  claimBackupBatch(input: ClaimRequest): Promise<BackupBatch | null>
  acknowledgeBackupBatch(input: BackupAck): Promise<void>
}
```

명령 이름은 현재 PKMS 흐름과 유사하지만, 계약은 SQL/PostgREST/RPC에 의존하지 않는다. 다른 애플리케이션이 같은 Data Node를 쓸 계획이라면 `MetadataStore`를 workspace/document 단위로 만들지 말고 generic records/transactions API로 올릴지 별도 판단해야 한다. 범용성은 같은 테이블명을 재사용하는 것이 아니라 schema와 domain ownership을 분리하는 데 있다.

## Android SQLite 구현은 가능한가?

가능하다. Android는 SQLite API를 제공하고, SQLite transaction은 여러 관련 쓰기를 한 transaction으로 묶는다. Supabase RPC에서 실행하던 atomic command를 SQLite transaction으로 구현할 수 있다. Android의 SQLite API는 WAL과 transaction API를 지원한다. [Android SQLiteDatabase API](https://developer.android.com/reference/android/database/sqlite/SQLiteDatabase.html), [Android SQLite 성능/사용 권고](https://developer.android.com/topic/performance/sqlite-performance-best-practices)

Object payload는 SQLite BLOB에 모두 넣기보다 private filesystem에 stream으로 쓰고, SQLite에는 key/path, size, SHA-256, state, references만 기록하는 구성이 적절하다. 두 저장소는 단일 ACID transaction이 아니므로 현재 R2처럼 `STAGING → file durable → metadata committed → export/replicated` 상태 전이와 startup recovery를 구현해야 한다. 앱 전용 파일은 Android 앱 uninstall 시 제거되므로 export/replica 정책도 별도로 필요하다. [Android app-specific storage lifecycle](https://developer.android.com/training/data-storage/app-specific)

Room은 SQLite 접근을 편하게 할 수 있지만, 일반적인 DB transaction만으로 file write와 metadata write를 원자화하지는 않는다. 그리고 Cloudflare Worker가 연결할 DB는 휴대폰의 process-local SQLite를 직접 여는 것이 아니라, Data Node가 노출하는 제한된 HTTP command API가 된다.

## Supabase adapter도 동일 contract를 구현할 수 있는가?

가능하다. 현재 Supabase/Postgres는 이미 `pkms_append_document_update`, `pkms_apply_operation`, `pkms_claim_workspace`, `pkms_finish_flush` 같은 atomic RPC를 사용한다. 이 함수들을 provider adapter 내부에 유지하고 Worker에서 repository interface만 호출하게 만들면 현재 backend를 첫 번째 구현으로 둘 수 있다.

Supabase Realtime은 `RealtimeBus`의 한 adapter가 된다. Supabase Realtime broadcast는 REST API를 통해 보내고 WebSocket으로 클라이언트에 전달할 수 있다. 다른 backend를 쓸 때는 `publish(topic,event,payload)` 같은 별도 port를 두되, auth/ACL, delivery guarantee, reconnect semantics, ordering은 명시해야 한다. [Supabase Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast)

중요한 점은 Android adapter가 Realtime을 필수로 제공하지 않아도 되게 하는 것이다. `MetadataStore`는 durable source, `RealtimeBus`는 낮은 지연의 notification/CRDT relay다. Realtime이 unavailable일 때 client가 HTTP snapshot/update log를 재조회해 결국 동기화되면, 기능 저하는 있지만 저장 데이터는 안전하다.

## 가장 큰 실물 위험: Worker에서 Android 노드까지의 연결

앱 → Worker → Data Node 구조라면 Cloudflare Worker가 S21의 HTTP endpoint에 도달해야 한다. 휴대폰은 대개 NAT 뒤에 있고 공인 고정 주소가 없으므로 단순 LAN 주소/Tailscale 주소만으로 Worker가 접근한다고 가정할 수 없다.

Cloudflare Workers VPC는 Worker가 Tunnel/Mesh로 연결된 private service에 접근하는 기능을 제공한다. 다만 tunnel connector는 private network 안에서 실행되어야 한다. Android에서 `cloudflared`를 상시 운영하고 Android의 백그라운드 정책 아래에서 tunnel을 유지할 수 있는지는 별도 기술 검증이 필요하다. Workers VPC는 현재 beta로 표시되어 있다. [Workers VPC networks](https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/), [Cloudflare Tunnel](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/), [Workers VPC quickstart](https://developers.cloudflare.com/workers-vpc/get-started/)

이 연결이 해결되지 않으면 세 가지 중 하나를 골라야 한다.

- Worker가 public authenticated HTTPS endpoint로 Data Node에 접근하게 한다.
- Data Node가 outbound WebSocket/long-poll을 열어 Worker 쪽 relay/queue에서 요청을 가져간다.
- 앱 클라이언트가 Data Node에 직접 접근한다. (사용자의 의도한 Worker-mediated 경로와 다름.)

이 선택은 구현 세부가 아니라 핵심 feasibility gate다. Worker가 node에 접근할 수 없다면 DB/ObjectStore adapter가 아무리 잘 설계돼도 운영 데이터 경로가 연결되지 않는다.

## 완전 교체가 아닌 단계적 선택성

“Android와 Supabase를 갈아 끼운다”를 첫 목표로 삼기보다, 필요한 구성요소별로 선택 가능하게 하는 것이 현실적이다.

| Profile                       | Metadata DB       | Object Storage                      | Realtime                | 의미                                                    |
| ----------------------------- | ----------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------- |
| Current Cloud                 | Supabase/Postgres | Cloudflare R2 staging               | Supabase Realtime       | 현재 기능/availability 유지                             |
| Hybrid Object Node            | Supabase/Postgres | Android Data Node                   | Supabase Realtime       | raw objects만 S21로 이동, Supabase dependency는 남음    |
| Android Primary               | Android SQLite    | Android filesystem                  | 별도 relay 또는 polling | Supabase 제거, Worker→node network 및 availability 필수 |
| Supabase DB + Android Replica | Supabase/Postgres | Android primary + A Quantum replica | Supabase Realtime       | blob ownership를 바꾸되 transaction store는 유지        |

같은 환경 설정으로 네 component를 독립 선택하도록 하면 migration/shadow tests를 할 수 있다. 모든 component를 한꺼번에 바꾸는 config는 위험하다. MetadataStore, ObjectStore, RealtimeBus, BackupPublisher 각각의 conformance tests를 분리해야 한다.

## 추천 마이그레이션 순서

### 1단계 — 계약과 characterization

- 현재 worker API의 성공/실패 semantics와 DB transaction result를 기록한다.
- `MetadataStore`, `ObjectStore`, `RealtimeBus`, `BackupPublisher` interfaces를 만든다.
- 현재 Supabase/R2/GitHub 코드를 provider adapters로 감싼다. DB RPC SQL은 Supabase adapter 안에 둔다.
- 계약 테스트로 중복 operation, concurrent revision, duplicate Yjs update, crash-after-object-write, GitHub flush retry, restore/replay를 정의한다.

### 2단계 — Android backend 단독 vertical slice

- S21 앱 안의 SQLite + private filesystem에 작은 object 하나와 metadata transaction을 기록한다.
- Worker가 authenticated HTTP API로 그 object를 put/get한다.
- 앱 강제종료 후 database/object reconciliation을 수행하고, A Quantum으로 snapshot 복제한다.
- Cloudflare Worker→Android node 연결을 실제 네트워크 조건으로 입증한다.

이 단계에서는 PKMS 기존 production data를 이관하지 않는다. 먼저 storage primitive와 request reachability를 검증한다.

### 3단계 — feature별 backend 비교

- Document operation과 Yjs update를 SQLite adapter와 Supabase adapter 양쪽에 같은 command로 적용해 result/revision/hash를 비교한다.
- Object bytes를 두 곳에 dual-write하고 read-back hash를 비교한다.
- Realtime은 same bus contract로 별도 측정하고, node offline/reconnect 뒤 HTTP log replay가 되는지 본다.

### 4단계 — primary를 하나씩 전환

- 먼저 ObjectStore만 Android로 옮기고, 이후 metadata DB를 전환한다. 각 단계에서 rollback 가능한 export를 둔다.
- Supabase가 최종적으로 필요 없다는 목표라면 MetadataStore까지 Android primary가 된 뒤 Supabase writes를 끈다.
- GitHub export는 일정 주기로 유지하고, A Quantum replicate와 GitHub backup을 서로 다른 복구 경로로 확인한다.

## 최종 판단

**추상화는 실현 가능하고, 올바른 방향이다.** 다만 “Android/Supabase 하나의 backend flag로 교체”는 너무 거친 목표다. 실제로는 Metadata DB, Object Storage, Realtime, GitHub backup의 네 capability를 분리해야 한다. Android는 SQLite와 filesystem adapter로, Supabase는 Postgres RPC와 Realtime adapter로 구현할 수 있다.

기술적으로 가장 어려운 점은 SQLite 자체가 아니다. 현재 PKMS semantics를 DB RPC에서 application port로 분리하는 작업, object+metadata의 cross-store recovery, Worker가 Android node에 도달하는 네트워크 경로, 두 backend 사이 conformance를 보장하는 테스트가 핵심이다. 특히 Worker-to-S21 connectivity를 검증하기 전에는 “Android backend로 실제 교체 가능”을 완료된 사실로 취급하면 안 된다.
