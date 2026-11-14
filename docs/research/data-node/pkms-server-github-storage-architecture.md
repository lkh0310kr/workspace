# `pkms-server`의 GitHub 저장 흐름과 범용 Storage Node 방향

조사일: 2026-11-08  
조사 대상: `apps/pkms-server/`, `apps/pkms-server/supabase/`, 관련 architecture/planning 문서

## 핵심 결론

현재 코드는 **모든 사용자 변경마다 GitHub commit을 만들지 않는다.** 편집/파일 연산을 Supabase DB transaction에 즉시 저장하고, dirty 변경을 모아 GitHub에 batch commit으로 flush한다. 문서 변경은 workspace revision을 증가시키고 첫 대기 시각을 약 15분 뒤로 설정하며, Worker cron이 flush를 처리한다. GitHub의 transaction당 commit 문제는 현재 구조에서 Supabase가 write journal/transaction DB 역할을 해 batch commit으로 완화한다.

그래서 사용자 지적대로 **현재 런타임을 기준으로 보면 Supabase 의존도가 높고, 사실상 Supabase 중심 시스템이다.** 더 정확한 이름은 “GitHub-backed PKMS”보다는 **“Supabase-first PKMS with eventual GitHub export/mirroring”**이다. GitHub는 repository 선택/초기 import, 원본 파일과 Git history, 주기적 변경 export, 외부 변경 확인에 실제로 쓰이지만, 일반적인 편집의 즉시 저장소이자 조회/협업 상태의 주 원천은 아니다.

대신 Supabase는 단순 임시 cache가 아니다. 현재 live state와 operation idempotency, Yjs update log 및 compacted document state, workspace/file metadata, revision과 dirty 상태, flush lease와 retry, Realtime endpoint/token, GitHub 초기 mirror까지 맡는다. 첨부 파일 바이트는 Supabase Storage가 아니라 **Cloudflare R2**에 임시 보관되고 GitHub commit 성공 뒤 R2 객체를 지운다. 따라서 이 구성을 “GitHub + 얇은 임시 cache”라고 부르는 것은 정확하지 않다.

그래도 다음 단계에서 이 계층을 **범용 Metadata DB + Object Storage + Change Journal/Sync Adapter**로 추상화하는 것은 합리적이다. PKMS는 그 위의 도메인 애플리케이션이 된다. Supabase를 제거하려면 DB transaction/journal뿐 아니라 Realtime, scheduling/lease, object staging, OAuth/token 보안 역할도 대체하거나 명시적으로 포기해야 한다.

## 현재 코드에서 확인한 데이터 흐름

### Markdown/Yjs edit

1. `writeDocument()`이 저장된 Yjs state와 update log를 읽고, 새 update를 적용해 현재 Markdown 본문과 크기를 계산한다.
2. `pkms_append_document_update` PostgreSQL RPC가 workspace row를 잠그고 operation ID 중복을 검사한다. 한 DB transaction 안에서 update log, operation 결과, `pkms_files.content`와 revision/dirty 값을 기록하고 workspace revision과 GitHub flush 예정 시각을 갱신한다.
3. Worker는 ACK를 반환하고 별도로 Supabase Realtime broadcast를 보낸다.
4. Cron flush가 dirty file들을 revision 기준으로 읽고 GitHub blob/tree/commit을 만든 뒤 branch ref를 갱신한다. 여러 파일 변경을 하나의 commit으로 묶으며, 성공한 파일의 dirty 상태와 이전 GitHub head를 반영한다.

근거: [`writeDocument`와 `flushWorkspace`](../../../apps/pkms-server/src/SupabaseVault.ts), [`pkms_append_document_update` migration](../../../apps/pkms-server/supabase/migrations/20261101130000_atomic_document_write.sql), [flush lease/finish migration](../../../apps/pkms-server/supabase/migrations/20261101120000_flush_leases.sql).

따라서 durability 관점의 현재 계약은 **“Supabase commit 성공 = 앱 서버에 변경이 저장됨; GitHub commit 성공 = repo snapshot에 반영됨”**으로 분리되어 있다. 계획 문서도 editor의 `clean`은 서버 persist, GitHub mirror 상태는 별도로 표시한다고 정의한다. [Editor unification](../../planning/editor-unification.md)

### Metadata/tree 및 초기 repository load

GitHub tree와 Markdown 본문을 Supabase 테이블에 mirror/cache 한다. directory 목록은 GitHub tree를 필요할 때 읽고 Supabase에 저장하며, note body를 미러링해 열기·검색·링크 rewrite 중 GitHub 왕복을 피한다. 이 Supabase 데이터는 cache 성격도 있지만, edit 이후에는 dirty live state와 collaboration state의 authoritative 저장소다. [Content mirror migration](../../../apps/pkms-server/supabase/migrations/20261103100000_content_mirror.sql)

코드의 `mirror()`에는 미러가 완료된 다음 “the database is authoritative”라고 직접 주석이 있다. 이 지점부터 GitHub를 읽기 원본으로 삼는 구조가 아니라, Supabase의 DB가 서비스 동작을 이끄는 원천이고 GitHub는 바깥으로 내보내는 versioned repository/snapshot이 된다. 따라서 “GitHub를 안 쓰는 격”이라는 평가는 **실시간 서비스 데이터 경로를 기준으로는 거의 맞다**고 보는 것이 정확하다. GitHub가 완전히 불필요한 것은 아니지만, 현재는 앱 사용자에게 보이는 Git 저장소/역사와 eventual export 역할이다.

### 첨부 파일

업로드 바이트는 `ASSET_BUCKET`(Cloudflare R2)에 기록하고 metadata/operation은 Supabase RPC로 저장한다. GitHub flush 때 Worker가 R2 객체를 읽어 Git blob을 만들고, 성공 처리 후 R2 staging object를 삭제한다. 즉 GitHub commit 전에는 **R2가 임시 object staging**, Supabase가 metadata/transaction log다. [R2 upload와 GitHub flush](../../../apps/pkms-server/src/SupabaseVault.ts), [worker bindings](../../../apps/pkms-server/wrangler.jsonc).

### Realtime와 hosting

Cloudflare Worker가 API/auth/OAuth token/MCP/cron을 제공하고, Supabase Realtime이 live update broadcast를 제공한다. Supabase를 빼면 편집의 transaction store뿐 아니라 realtime fanout도 새 구현이 필요하거나, 실시간 공동 편집 요구를 낮춰야 한다. [PKMS integration architecture](../../architecture/pkms/overview.md)

## GitHub commit 모델에 대한 정확한 평가

GitHub Git Database API는 blob → tree → commit → branch reference 갱신 단계로 작업한다. 여러 blob/path 변경을 하나의 tree에 넣고 **한 번의 commit**으로 묶는 것이 가능하며, 현재 `flushWorkspace()`가 이 방식을 사용한다. branch ref 갱신은 낙관적 경쟁 지점이라 외부 writer와 경합 시 충돌을 다뤄야 하지만, 각 편집을 commit할 필요는 없다. [GitHub Git database API guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database), [Git Trees API](https://docs.github.com/en/rest/git/trees)

현재 배치 모델의 한계는 transaction 비용을 없애는 게 아니라 **GitHub snapshot 반영을 지연**한다는 점이다. Supabase는 각 operation을 빨리 durable하게 받아들이고 GitHub에 주기적으로 내보내는 journal/working state다. GitHub 단독으로 즉시 transaction을 확정해야 한다면 매 transaction마다 commit을 만들거나, 자체 pending log/queue를 별도로 둬야 한다. 두 번째 선택은 결국 로컬 DB/저널 또는 다른 서비스가 필요한데, 그 역할을 device-local SQLite나 독립 Storage Node가 맡을 수 있다.

## Supabase 의존성의 성격

현재 Supabase를 없애려 할 때 대체해야 할 capability를 분리하면:

| 현재 역할                  | 코드/데이터                                              | 없앨 때 대체할 것                                             |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Transactional metadata     | `pkms_workspaces`, `pkms_files`, `pkms_operations`, RPC  | ACID transaction, idempotency, revision conflict 처리         |
| Collaborative document log | `pkms_documents`, `pkms_document_updates`, Yjs           | durable update append, compaction/snapshot, state-vector sync |
| Realtime                   | Supabase Realtime broadcast/JWT                          | WebSocket pub/sub relay 또는 실시간 협업 축소                 |
| Flush queue/coordination   | dirty flag, due time, lease, retry count, cron claim RPC | durable outbox, single-writer lease, 재시도 scheduler         |
| Object staging             | Cloudflare R2 (`ASSET_BUCKET`)                           | node filesystem/object backend 및 staging/recovery            |
| Repository mirror/cache    | tree, directory, note content mirror                     | 로컬 DB/cache, lazy GitHub reads 또는 별도 indexing           |
| Hosting/API/auth           | Cloudflare Worker/GitHub OAuth                           | 기기 접근 경로, OAuth token 보호, 공개/사설 네트워크 연결     |

따라서 “Supabase 의존성을 하나 줄이자”는 변경은 한 서비스 URL을 지우는 일 이상이다. 다만 단일 S21 primary와 A Quantum replica를 전제로 제품 요구를 단순화하면 PostgreSQL RPC와 Realtime을 기기 내부 SQLite + node API/단순 sync로 합칠 수 있다. 그 경우 공동 편집/항상 접속 가능한 공개 API는 별도 요구사항이 된다.

## 현실적인 아키텍처 선택지

### A. 현재처럼 Supabase를 live transaction store, GitHub를 repository snapshot으로 유지

- 장점: 이미 구현한 ACID RPC, Yjs update log, lease/retry, realtime 경로를 재사용한다. GitHub commit은 변경 batch당 하나다.
- 단점: Supabase가 핵심 런타임 의존성으로 남고, 첨부는 R2, API/auth는 Cloudflare, 원본 repo는 GitHub로 여러 운영 경계가 있다.
- 맞는 경우: 기존 Web/Desktop/iOS 다중 클라이언트와 동시 편집을 유지하고, 현재 서비스 안정화를 우선할 때.

### B. Worker가 Android Data Node를 범용 저장소로 호출

- PKMS 앱(Web/Desktop/iOS): 기존처럼 Worker의 일반 API만 호출한다.
- Worker: 인증, 권한, PKMS 문서/operation 의미, API 계약과 오류 처리를 소유한다. 저장 요청을 Data Node로 위임한다.
- S21 Data Node: PKMS 도메인을 모르는 범용 `put/get/head/delete`, hash/size 검증, staging과 durable persistence를 제공한다.
- GitHub: Worker가 변경분을 주기적으로 batch commit으로 export한다.
- A Quantum: node-to-node replica/backup target이다.
- 장점: 앱과 PKMS API는 유지되고 저장 구현만 교체된다. 다른 Worker/API 앱도 같은 storage contract를 사용할 수 있다.
- 단점: Worker가 S21 Data Node에 안정적으로 도달해야 한다. Android의 background/충전/네트워크 가용성이 요청 경로의 한계가 된다.
- 맞는 경우: Worker가 앱/API 경계로 남고 Android가 투명한 storage provider가 되길 원할 때.

#### B-1. Data Node가 Object Storage만 담당하고 Supabase DB는 유지

```text
PKMS app → Worker → Supabase (metadata/Yjs/realtime)
                 ├→ Android Data Node (raw object bytes)
                 └→ GitHub (scheduled repository export)
```

이 구성은 R2/object payload 부분을 대체하지만, Supabase는 계속 metadata transaction과 collaboration state의 operational primary다. 따라서 Supabase 의존성은 남는다.

#### B-2. Supabase를 제거하고 Data Node가 범용 DB + Object Storage 제공

```text
PKMS app → Worker (auth + PKMS API/business logic)
                 └→ Android Data Node
                     ├─ generic transactional metadata API/SQLite
                     └─ generic object API/filesystem
                 └→ GitHub (scheduled batch export)
```

Data Node는 `pkms_files`, `pkms_documents` 같은 PKMS domain API를 직접 제공하지 않는다. 다만 Supabase 없이 operation transaction, idempotency, revisions, Yjs update journal를 영속화하려면 범용 DB primitive는 제공해야 한다. 여기서 “raw infra”는 아무 API도 없다는 뜻이 아니라 **PKMS 규칙을 모르는 generic storage contract**를 뜻한다.

이 설계는 Supabase를 실제 대체하지만 Worker↔Data Node network protocol, auth, DB transaction boundary, outbox/lease, 장애·재시도 정책을 새로 만든다. Android Data Node의 가용성이 PKMS 서버의 가용성을 좌우한다.

### C. Cloudflare Durable Object SQLite + R2로 Supabase 역할을 Cloudflare로 흡수

- Durable Object SQLite: workspace별 transactional SQL, single-object consistency, WebSocket actor/coordination/outbox.
- R2: object payload 저장.
- GitHub: 배치 snapshot commit.
- 장점: 외부 Supabase 프로젝트를 줄이고 기존 Cloudflare Worker와 같은 운영 계정 안에서 transaction/realtime/queue를 구성할 수 있다. Cloudflare는 SQLite-backed Durable Objects의 transactional storage와 PITR API를 제공한다. [DO SQLite Storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- 단점: Supabase dependency를 없애도 Cloudflare dependency는 더 깊어진다. object별 저장 한도/비용과 SQLite DO migration을 확인해야 하며, user-owned phone node는 아니다. Cloudflare 문서상 무료 Durable Object SQLite storage 한도는 1 GB, Paid는 object당 10 GB다(현행 문서 기준). [Durable Objects FAQ](https://developers.cloudflare.com/durable-objects/reference/faq/)
- 맞는 경우: 사용자가 온라인 접근 가능한 호스팅 backend를 필요로 하고, Cloudflare 종속을 허용할 때.

### D. GitHub-only persistence

- 매 transaction commit은 피하려면 앱/Worker 어딘가에 pending journal가 필요하다.
- journal 없이 즉시 commit하면 concurrent clients 간 ref update 경합과 commit 수가 커진다.
- journal를 device-local SQLite에 두면 실질적으로 **B안의 SQLite journal + GitHub batch snapshot**으로 돌아온다.
- 결과적으로 GitHub-only는 “DB + object storage의 대체품”보다 “batch commit snapshot backend”로 보는 편이 맞다.

## Worker와 Data Node의 책임 경계

의도한 형태는 **app → Worker → Data Node**이며, 앱이 Data Node를 직접 호출하는 방식은 기본안이 아니다. Worker는 기존 일반 API와 PKMS 기능을 유지하고 Data Node는 범용 low-level persistence만 제공한다.

| 책임                              | Worker                                                      | Android Data Node                      | GitHub                    |
| --------------------------------- | ----------------------------------------------------------- | -------------------------------------- | ------------------------- |
| PKMS authentication/authorization | 소유                                                        | service credential 검증                | repo identity/history     |
| PKMS document/file API            | 소유                                                        | PKMS 도메인을 모름                     | repo file layout          |
| Transaction/idempotency/revision  | Supabase 유지 시 RPC 위임; 제거 시 generic DB contract 사용 | Supabase 제거 시 transaction primitive | Git commit 단위           |
| Object byte stream                | policy/validation/routing                                   | durable generic put/get/head/delete    | scheduled snapshot object |
| Realtime/CRDT semantics           | Yjs protocol과 broadcast                                    | generic update bytes 저장 가능         | 해당 없음                 |
| Backup scheduling/batching        | policy/scheduler                                            | 복제 대상 제공                         | versioned batch commit    |

따라서 결정할 것은 Data Node가 PKMS 기능을 가질지 여부가 아니다. Data Node는 PKMS-aware가 아니어도 된다. 핵심은 **metadata DB를 Supabase에 남길지, Data Node의 generic transactional DB로 옮길지**다. Object Storage만 옮기면 Supabase 의존성은 남는다.

Worker가 Android node를 호출한다면 node의 주소와 도달성도 설계 대상이다. S21이 사설 tailnet 안에만 있으면 public Cloudflare Worker가 그 주소에 접근할 수 있다고 가정하면 안 된다. VPN/tunnel/relay/Worker 배치와 node 오프라인 중 요청 정책을 함께 결정해야 한다.

## 권장 추상화 경계

`pkms-data-node`를 PKMS 전용 서버 제품 이름보다 **범용 저장 노드/contract**로 정의할 수 있다. 하지만 GitHub adapter와 database adapter를 같은 단일 인터페이스로 억지 통합하지 말고 역할을 나눈다.

```text
PKMS app → Worker (PKMS API / auth / domain rules)
       |
       +-- MetadataStore (Supabase adapter or Android-node adapter)
       |      transact(operationId, expectedRevision, mutation)
       |      appendDocumentUpdate / readSnapshot / compact
       |
       +-- ObjectStore (Android-node adapter)
       |      put(stream, hash) / get / head / delete
       |
       +-- ChangeJournal / Outbox (DB transactionally recorded)
              claimBatch / ackBatch / retry
                       |
               Android Data Node
               ├─ generic Metadata DB (if Supabase removed)
               ├─ raw Object Storage
               └─ A Quantum replica
                        |
                 GitHub Sync Adapter
                 blobs/tree/batch commit
```

권장 계층:

1. **MetadataStore**: 트랜잭션 경계, idempotency, revisions, reference metadata.
2. **ObjectStore**: streaming bytes, content hash, upload staging, immutable object identity.
3. **ChangeJournal/Outbox**: durable pending batch와 retry. 이 부분이 DB transaction과 GitHub commit 사이를 연결한다.
4. **Snapshot/Sync adapter**: GitHub는 경로/commit history와 external change detection에 특화된 adapter. 일반 S3-like object backend와 동일한 보장이라고 취급하지 않는다.
5. **Realtime adapter**: Worker가 Yjs/WebSocket updates를 전달한다. Data Node는 Yjs 규칙을 몰라도 durable update bytes를 저장할 수 있다.
6. **PKMS domain module**: Worker가 문서 schema, ingestion/normalization, backlinks/link rewrite, search indexing, retention 정책을 담당한다.

최소 계약의 예:

```ts
interface MetadataStore {
  applyOperation(input: {
    operationId: string
    expectedRevision?: number
    mutation: WorkspaceMutation
  }): Promise<{ revision: number; duplicate: boolean }>
  appendDocumentUpdate(input: {
    operationId: string
    fileId: string
    update: Uint8Array
  }): Promise<{ revision: number; duplicate: boolean }>
}

interface ObjectStore {
  put(
    key: string,
    source: ReadableStream<Uint8Array>,
    expectedSha256?: string
  ): Promise<StoredObject>
  get(key: string): Promise<ReadableStream<Uint8Array> | null>
  delete(key: string): Promise<void>
}

interface SnapshotPublisher {
  publish(batch: ChangeBatch): Promise<{ commitId: string }>
}
```

현재 Supabase RPC의 atomicity와 GitHub branch race를 구별해 contract test를 만들어야 한다. Supabase와 SQLite adapter가 동일한 `MetadataStore` 동작을 제공하도록 하면 migration path가 분명해진다. 이는 데이터 전체를 곧바로 옮기라는 뜻이 아니라, persistence를 앱 도메인 로직에서 분리하는 단계적 경로다.

## 추천 방향

### 바로 유지할 점

- GitHub의 “바뀔 때마다 즉시 commit” 대신 현재처럼 change batch를 하나의 commit으로 묶는 방식은 맞다. GitHub는 중요한 사용자 편집 가능한 snapshot, portable repository format, history로 계속 활용한다.
- GitHub branch head를 check하고 외부 변경/409를 보호하는 흐름은 유지한다.
- `server persistence`와 `GitHub snapshot synced` 상태를 분리해서 사용자에게 표시한다.

### 다음 실험

1. **기능 추출 전 현재 역할을 이름으로 명확히 함:** Supabase는 `transactional workspace store + realtime relay`, R2는 `asset staging store`, GitHub는 `versioned repository snapshot`.
2. **provider-neutral interfaces와 contract tests를 먼저 도입:** `MetadataStore`, `ObjectStore`, `ChangeJournal`, `RealtimeTransport` 경계를 명시하고 현재 Supabase/R2 구현을 adapter로 감싼다.
3. **SQLite adapter를 앱과 같은 저장 core에 구현:** Linux test host와 S21 Android host에서 SQL transaction + Yjs update journal + file object staging을 검증한다. 실제 migration 전 dual-run/shadow compare로 결과를 비교한다.
4. **GitHub writer는 batch commit 유지:** 저장 journal에서 dirty paths를 모아 한 tree/commit으로 publish한다. 소규모 파일이면 15분 window를 유지하되, idle 상태에서도 지연을 제한하고 critical writes의 manual flush를 제공한다.
5. **Realtime을 별도 선택:** 2-device/개인 사용에서 동시 편집이 필수인지 결정한다. 불필요하면 poll/foreground sync로 단순화하고, 필수면 Tailscale private websocket이나 DO relay를 검토한다.
6. **A Quantum을 두 번째 복제 노드로 활용:** S21 local commit → A Quantum replicated ACK를 내구성 등급으로 노출한다. GitHub push는 추가 offsite snapshot 상태다.

Android S21을 host로 삼는다면 항상 접속 가능한 서버라는 가정은 별도 위험으로 남는다. 이것은 저장 adapter를 추상화하는 것만으로 없어지지 않는다.

## 최종 의견

사용자의 관찰은 정확하다. **GitHub의 commit-oriented persistence를 직접 transaction store로 쓰면 매 transaction마다 commit을 만들지 않도록 중간 durable journal/transaction DB가 필요하다.** 그런데 현재 `pkms-server`가 이미 그 패턴을 구현했다. Supabase가 operation당 ACID commit을 받아들이고, dirty workspace를 배치 처리해 GitHub commit으로 내보낸다. 첨부 파일은 R2 staging을 거친다.

그리고 두 번째 지적도 맞다. 지금 구조는 “GitHub를 저장 엔진으로 활용하면서 Supabase는 임시 cache로만 사용”하는 것이 아니다. **Supabase가 operational primary이고 GitHub는 delayed repository mirror/export다.** 즉 현재 구현은 사용자에게 GitHub repo를 workspace처럼 보여주지만, 내부 서비스 동작에서는 GitHub commit 주기를 피해 Supabase를 주 데이터베이스로 활용하고 있다. 이 설계가 잘못됐다는 뜻은 아니다. 실시간 협업과 서버 가용성을 위해 의도적으로 선택한 tradeoff지만, Supabase 하나를 없애려는 목표와는 반대 방향의 설계다.

따라서 개선 질문은 “GitHub를 commit 없는 DB로 바꾸는가?”보다:

> `pkms-server`가 현재 Supabase + R2를 operational primary로 쓰는 선택을 계속할 것인가, 아니면 S21/A Quantum의 범용 Data Node를 primary로 하고 GitHub는 batch snapshot/export backend로 내릴 것인가?

답은 **기술적으로 가능하고, 이때 Data Node는 PKMS 기능을 갖지 않는 raw storage provider면 된다.** PKMS 앱은 Worker의 기존 일반 API를 계속 쓰고, Worker가 Data Node의 generic metadata/object persistence API를 호출한다. object storage만 옮기면 Supabase는 계속 metadata DB로 남는다. Supabase까지 없애려면 Worker의 transaction state도 Data Node의 generic DB로 옮겨야 한다. S21/A Quantum node가 operational primary가 되고, GitHub는 정기 batch snapshot/export backend가 된다. 실제 교체는 `MetadataStore`/`ObjectStore` interface와 contract tests를 먼저 두고 SQLite + local object store + GitHub scheduled batch publisher의 작은 vertical slice로 판단하는 편이 리스크가 낮다.
