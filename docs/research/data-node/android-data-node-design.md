# Android Data Node 설계안

작성일: 2026-11-08  
상태: 구현 작업 취소 — 2026-11-08 사용자 요청. 완료·검증 범위와 미완료 항목은 [취소 기록](CANCELLATION.md)을 참조.

## 요약

Android Data Node는 PKMS 전용 기능이 없는 **범용 transactional record store + object store**다. PKMS 앱은 Worker의 기존 API만 호출하고, Worker는 인증·PKMS 규칙·요청 처리를 맡아 Data Node에 저장 명령을 위임한다. Data Node는 SQLite와 앱 내부 파일 저장소를 사용하며, 주기적으로 GitHub에 변경분을 export한다. A Quantum은 선택적 두 번째 복제 노드다.

```text
PKMS Web / Desktop / iOS
          │ 기존 일반 API
          ▼
Cloudflare Worker
  auth · PKMS API/domain logic · validation · logs
      ├──────── transactional record commands ───────┐
      ├──────── raw object byte streams ──────────────┤
      └──────── schedule backup/export ──> GitHub     │
                                                     ▼
                                      Android Data Node (S21)
                                      ├─ SQLite metadata/transactions
                                      ├─ filesystem object store
                                      ├─ durable outbox + recovery
                                      └─ optional replica → A Quantum
```

**중요한 결론:** Supabase와 Android 구현을 교체 가능하게 만들 수 있지만, 교체 단위는 한 개의 `DataNode` class가 아니다. MetadataStore, ObjectStore, RealtimeBus, BackupPublisher를 분리하고 각각의 계약을 맞춘다. Worker가 Android에 도달하는 네트워크 경로를 검증하기 전에는 실제 backend 교체 가능성을 확정할 수 없다.

## 구현·검증 기록

`apps/android-data-node/`에 네트워크를 사용하지 않는 Android 로컬 프로토타입을 추가했다. SQLite record transaction과 앱 전용 파일 기반 content-addressed object store를 구현했고, 제한된 `android.permission.DUMP` 권한의 ContentProvider를 통해 ADB shell이 로컬 명령을 직접 호출한다. `npm run data-node:one-click`은 빌드·설치 뒤 앱 내부 검사와 호스트에서 호출한 배치 기록 트랜잭션/idempotency/conflict/rollback/object round-trip을 실행하고, 앱 프로세스 강제 종료 뒤 저장 내용을 재조회한다. Android API 36 에뮬레이터와 S21 Ultra(SM-G998N, API 35) 실기기에서 통과했다. 최신 S21 실행에서 v1→v3 migration이 기존 record/object를 보존했고, 초기 9개, 재시작 12개, ADB 호스트 검사 12개가 통과했다. recovery는 pending commit 1건, staging 업로드 중단 1건, missing 1건, corrupt 1건, orphan 후보 1건을 예상한 상태로 분류했다. 개발 도중 USB 연결이 한 번 사라졌다가 다시 나타났으므로 장시간 연결 안정성은 별도 확인이 필요하다.

이 단계는 저장소 기본 동작, v1→v3 schema migration, pending/missing/corrupt/orphan object의 시작 시 reconciliation을 확인하는 프로토타입이다. orphan 파일은 후보로 기록하고 자동 삭제하지 않는다. 일반 앱 권한의 API/인증, network listener, 스트리밍 object API, 암호화·키 관리, 전원 차단/저장공간 부족 주입, reference 기반 GC, 백그라운드 운영 및 백업은 아직 구현되지 않았다. 실행 방법과 범위는 [Android Data Node 프로토타입 안내](../../../apps/android-data-node/README.md)를 참조한다.

## 목표와 제외 범위

### 목표

- PKMS와 무관한 generic storage API 제공
- atomic metadata transaction, idempotency, revision check 제공
- 원본 객체를 memory에 통째로 올리지 않고 stream 저장/조회
- 파일 저장과 SQLite metadata 사이의 실패를 탐지하고 복구
- Supabase/Postgres/R2 backend와 Android/SQLite/filesystem backend를 교체 가능하게 설계
- Worker와 Android node 사이 인증된 요청/응답 및 상관관계 로그 제공
- APK를 설치한 뒤 화면에서 Node를 시작하고 full diagnostics를 한 번에 실행
- 개발 PC에서도 한 명령으로 환경 검사·빌드·설치·검증·로그 수집
- GitHub에는 일정 주기로 snapshot/export하고 백업 내역과 복원 검증 결과 저장
- A Quantum으로 선택적인 두 번째 기기 복제

### v1 제외

- SQLite engine, filesystem, 암호화 primitive, Git 구현을 밑바닥부터 다시 작성하지 않는다. **DBMS를 새로 만드는 게 아니라 성숙한 SQLite 위에 PKMS와 무관한 DB service 계약·트랜잭션·복구 동작을 구현한다.**
- Node가 PKMS schema, markdown semantics, Yjs merge semantics, authentication policy를 알지 않는다.
- Android가 NAS급 24/7 uptime을 보장한다고 가정하지 않는다.
- GitHub를 online transaction DB나 random-access object store로 취급하지 않는다.
- 여러 기기 active-active DB replication은 v1에 넣지 않는다. S21 primary와 A Quantum backup/replica부터 시작한다.

## 설계 원칙

1. **Worker가 API와 도메인을 소유한다.** 모바일/웹 앱은 Worker만 호출한다.
2. **Node는 storage provider다.** Worker가 보낸 제한된 generic command와 object byte stream만 이해한다.
3. **DB transaction은 metadata 안에서 원자적이다.** SQLite와 object filesystem을 묶는 전역 ACID는 만들 수 없으므로 상태 머신과 recovery를 제공한다.
4. **ACK 의미를 명확히 한다.** `local_committed`, `replicated`, `github_exported`는 서로 다른 내구성 상태다.
5. **Realtime은 알림이며 DB의 진실 원천이 아니다.** 알림이 유실돼도 revision/change log를 재조회해 수렴해야 한다.
6. **측정하고 드러낸다.** Node online/offline, 저장 용량, 복제 지연, GitHub export 시각, 무결성 결과, 오류를 사용자가 확인하고 내보낼 수 있어야 한다.
7. **backend 선택을 capability별로 한다.** Supabase DB만 남기고 object만 Node로 옮기는 hybrid도 가능하다.

## 서비스 계약

### MetadataStore

임의 SQL endpoint를 외부에 노출하지 않는다. Worker가 database schema/SQL에 묶이지 않도록 제한된 transaction command를 제공한다.

v1 명령은 아래 개념을 지원한다.

- namespace/record key 단위 `get`, prefix `list`, `put`, `delete`
- 한 request 안에서 conditional write와 여러 record 변경을 하나의 transaction으로 적용
- `expectedVersion` compare-and-swap
- `operationId` idempotency: 같은 ID와 같은 request hash는 원래 결과를 반환하고, 같은 ID에 다른 payload면 conflict
- transaction 결과와 monotonically increasing revision 반환
- 변경 log/outbox event를 동일 DB transaction 안에 append
- 다음 revision 이후 변경 내역을 cursor로 읽고 재연결/replay
- 제한된 secondary index 조회. 임의 full table scan이나 앱이 직접 schema를 바꾸는 기능은 v1에서 허용하지 않음

초기 논리 테이블/컬렉션:

| 저장 집합 | 역할 |
|---|---|
| `records` | namespace, key, JSON value, version, updated time |
| `record_indexes` | Worker가 선언한 제한된 index key/value와 record key |
| `operations` | operation ID, request hash, response/result, revision, 완료 시각 |
| `change_log` | 순서가 있는 변경 이벤트와 revision cursor |
| `object_metadata` | object ID, SHA-256, bytes, content type, state, key version |
| `object_references` | object를 참조하는 opaque namespace/key 쌍 |
| `outbox` | 복제 및 GitHub export 대상, 상태, 재시도 횟수 |
| `backup_batches` | batch ID, manifest hash, 대상 GitHub head, status, 완료 시각 |
| `schema_migrations` | storage schema 버전과 migration history |
| `diagnostic_runs` / `error_events` | 진단과 오류 요약. 사용자 데이터/토큰은 저장하지 않음 |

위 스키마는 물리 구현 제안이다. Worker가 PKMS-specific metadata record를 generic `records`에 직렬화할 수 있어야 하며, Node는 그 JSON의 도메인 필드 의미를 추론하지 않는다. 검색이 필요하면 Worker가 선언한 제한된 index API를 사용한다. SQLite FTS 같은 provider-only 기능은 공통 contract로 노출하지 않는다.

예시 command(프로토콜 설명용 의사 구조):

```json
{
  "operationId": "unique-request-id",
  "requestHash": "sha256-of-canonical-request",
  "expectedRevision": 42,
  "mutations": [
    {"type": "put", "namespace": "workspace-records", "key": "opaque-key", "value": {"example": true}, "expectedVersion": 3},
    {"type": "appendEvent", "namespace": "document-updates", "key": "opaque-doc", "value": {"encoding": "base64url", "data": "..."}}
  ]
}
```

Node는 batch 전체를 하나의 SQLite transaction으로 처리한다. 이는 HTTP transaction callback이나 원격 임의 SQL 실행이 아니다.

### ObjectStore

object API는 metadata DB의 record API와 분리한다.

| 동작 | 계약 |
|---|---|
| `beginPut` | object ID, 예상 크기(optional), operation ID, content type 수신 후 staging upload handle 발급 |
| `writeChunk` | 고정 상한 chunk, chunk sequence/offset, chunk checksum 검증, 재시도 가능 |
| `completePut` | 전체 SHA-256/크기 검증 후 immutable object를 최종 경로로 publish하고 metadata/outbox 기록 |
| `get` | 검증 가능한 metadata와 streaming body 반환. range read는 필요성과 구현 검증 후 추가 |
| `head` | object 존재, 크기, content hash, durability status 반환 |
| `delete` | reference/retention policy 확인 후 tombstone 처리; 즉시 물리 삭제 금지 |
| `list` | 일반 listing은 보조 진단 전용. app object reference 질의의 기준은 MetadataStore |

권장 object key는 content-addressed SHA-256을 기반으로 하되, 원본 민감정보가 key에서 노출되지 않도록 내부 opaque ID와 해시 저장 정책을 분리한다. 동일 content가 올라오면 existing object를 검증하고 참조만 추가한다. 원본 hash와 압축/encryption payload hash는 서로 다른 필드다.

최대 객체 크기, chunk 크기, 동시 업로드 수는 먼저 S21 실기기 성능·Worker request limit·GitHub export 한도를 측정한 뒤 product config로 정한다. 모든 제한은 API health/config에서 확인 가능해야 하고, 한도를 넘으면 부분 저장을 성공처럼 응답하지 않는다.

### RealtimeBus

Realtime은 저장소에서 독립된 port다.

- `publish(scope, revision, eventType, payload)`
- 클라이언트는 notification을 받으면 revision/update cursor를 확인하고 필요한 변경을 HTTP API로 읽는다.
- reconnect 시 DB change log 또는 snapshot에서 놓친 변경을 재생한다.
- realtime relay가 불가해도 durable write는 성공할 수 있다. Worker가 client 응답에 알림 상태를 혼동하지 않는다.
- Supabase Realtime은 한 구현으로 계속 쓸 수 있다. 대체 구현은 auth, topic ACL, message ordering, reconnect semantics를 contract tests로 맞춘다.

### BackupPublisher

GitHub는 일정 주기 export/restore용 versioned destination이다.

- GitHub API 실패가 local transaction 성공을 rollback하지 않는다.
- Node/Worker는 `lastExportedRevision`, pending count, last successful commit, last error를 표시한다.
- export는 manifest와 object hash/size/codec/keyVersion을 포함하고, 한 batch를 하나의 GitHub commit으로 묶는다.
- 일별/주기/수동 실행을 지원하며, GitHub export 이전 상태는 Android primary와 A Quantum replica 상태로 표시한다.
- export batch를 성공 처리하려면 GitHub head와 batch manifest 확인 후 local outbox를 ACK한다.
- restore는 snapshot을 새 namespace/database로 복원하고 해시/참조 검증을 마친 뒤에만 활성화한다.
- GitHub LFS 사용 여부와 quota 비용은 별도 결정. 일반 repository에 큰 객체를 아무 제한 없이 쓰지 않는다.

## 원자성·복구 설계

### Metadata transaction

각 요청은 아래 순서로 처리한다.

```text
authenticate → validate size/schema → canonicalize + request hash
             → begin SQLite transaction
             → idempotency check / expectedVersion check
             → apply record mutations + indexes + change_log + outbox
             → commit SQLite transaction
             → send ACK(local_committed, revision)
             → publish optional Realtime event
```

SQLite의 ACID transaction/WAL을 사용한다. durability에 필요한 `synchronous` 값을 명시하고, 성능 모드 변경은 power-loss 테스트를 통과한 경우에만 허용한다. 데이터베이스 file을 직접 복사해 백업하지 않는다. SQLite online backup API 또는 앱이 제어하는 consistent snapshot을 사용한다.

### Object와 metadata의 cross-store 상태

Filesystem과 SQLite가 하나의 transaction을 공유하지 않으므로 다음 단계로 보상/복구한다.

```text
ALLOCATED → STAGING → HASH_VERIFIED → FILE_PUBLISHED
     → METADATA_COMMITTED → REPLICATED → GITHUB_EXPORTED
```

- object write 중 crash: incomplete staging file은 재시도 가능하게 보존 후 TTL에 따라 quarantine/delete
- 최종 object file은 있는데 metadata row가 없음: startup scrub이 orphan 후보로 표시; grace period 전에 자동 삭제하지 않음
- metadata row는 있는데 object가 없음: object state를 `missing`으로 바꾸고 health error 생성; backup/replica에서 restore 시도
- 두 저장소 상태 불명: idempotency key와 operation log로 요청 결과를 조회한 뒤 재시도
- 여러 object 및 manifest: manifest가 모든 참조를 기록하고 전체 검증 전 `batch_committed`로 표시하지 않음
- GC: live references를 mark한 다음 유예 기간이 지난 unreferenced object만 sweep

### Replication과 durability status

S21이 primary, A Quantum이 replica로 동작할 경우 status는 아래로 분리한다.

| 상태 | 의미 |
|---|---|
| `local_committed` | S21 DB transaction 및 object durable publish 완료 |
| `replicated` | A Quantum이 동일 hash/object를 확인하고 ACK |
| `github_exported` | GitHub commit과 manifest를 read-back 확인 |

API는 사용 사례에 따라 `local_committed`까지 기다리거나 `replicated`를 요청할 수 있다. 응답은 실제 확인된 단계만 보고한다. GitHub 주기 백업이 늦어도 local data를 지우지 않는다.

## Android 앱과 운영

### 사용자 흐름

1. APK 설치 후 앱을 연다.
2. 앱이 storage directory/database를 초기화하고 node identity를 만든다.
3. `Run Diagnostics`를 눌러 DB·파일시스템·저장 여유 공간·network route·hash engine·backup credentials를 확인한다.
4. `Pair Worker`에서 Worker와 안전하게 페어링한다. QR/one-time code는 권한 부여 후 폐기되며 장기 secret을 QR에 넣지 않는다.
5. `Start Node`를 눌러 서버를 시작한다. 지속 notification에 node 상태, 최근 요청, stop control을 제공한다.
6. 앱의 `Run Full Validation`을 실행해 transaction/object/recovery/backup round trip을 확인한다.
7. `Export Diagnostic Bundle`로 오류 발생 시 필요한 redacted logs와 결과를 한 파일로 저장/공유한다.

Start Node는 Android 앱의 foreground service로 구현하되, 서비스 유형을 미리 임의 확정하지 않는다. Android 14+는 foreground service type/permission을 요구하며, Android 15+ 대상 `dataSync` foreground service는 24시간 중 총 6시간 제한과 BOOT_COMPLETED 시작 제한을 받는다. 영구 listen server에 `dataSync`를 쓰는 것은 부적절할 수 있다. `specialUse`는 타 유형으로 포괄되지 않는 valid use case지만 Google Play 배포 시 manifest use case review가 있다. APK 배포 경로와 S21 OS/API 수준을 기준으로 기술 검증 후 유형을 결정한다. [FGS service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [FGS timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)

### Android lifecycle/저장 제약

- private app storage는 앱 제거 시 함께 삭제될 수 있다. 앱 초기화/제거 전에 replica/export 상태를 보여 주고, 확인된 백업 없이는 위험 상태를 명확히 표시한다. [Android app-specific storage](https://developer.android.com/training/data-storage/app-specific)
- 앱 재시작 시 migration, pending transaction, WAL recovery, staging reconciliation을 수행한다.
- low storage, external storage detach, Android process kill, force stop, reboot, Wi-Fi/mobile network change, Doze, 배터리 최적화, thermal throttling을 모두 장애 상황으로 처리한다.
- 사용자가 Start Node를 선택할 때까지 Worker 요청을 받지 않는다. 기기 잠금 해제 전 접근이 필요한 경우 direct-boot 지원 범위를 명시적으로 결정한다.
- 하루종일 케이블 충전 중 발열/배터리 열화를 실측한다. 화면을 끈 상태의 장기 테스트 통과 없이 24/7 uptime을 보장하지 않는다.
- 앱 uninstall은 저장 데이터 손실 행위다. UI에 current replicas, GitHub export time, restore test date를 표시한다.

## Worker↔Node 네트워크 설계 gate

현재 요청 의도는 **PKMS app → Worker → Data Node**다. S21 뒤에 Worker가 접근할 수 있는 안정된 경로가 필요하다. Tailscale private IP만으로 Cloudflare Worker가 S21에 접근할 수 있다고 가정하지 않는다.

Cloudflare Workers VPC는 Tunnel/Mesh를 통해 private service에 접근하는 방법을 제공하지만, 사설 network 안의 connector와 설정이 필요하고 현재 문서에서 beta로 표시된다. S21 Android에서 connector를 지원·상시 실행 가능한지 검증되지 않았다. [Workers VPC](https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/), [Tunnel binding](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/), [Workers VPC setup](https://developers.cloudflare.com/workers-vpc/get-started/)

따라서 implementation 전에 `Node Reachability Spike`를 통과시킨다.

1. S21이 Android에서 안정적으로 실행할 수 있는 connector/tunnel 여부를 확인한다.
2. Worker에서 S21 health endpoint에 challenge-response authenticated request를 보낸다.
3. node가 sleep/background, 앱 재시작, LTE↔Wi-Fi 전환 후 reconnect하는지 측정한다.
4. Worker request timeout과 body stream limits 내에서 큰 object chunk를 왕복한다.
5. offline node 요청에 대한 timeout, retry, idempotency, user-visible state를 확인한다.

가능한 network profile:

| Profile | 경로 | 장단점 | 결정 기준 |
|---|---|---|---|
| Cloudflare private tunnel/VPC | Worker → private route → S21 connector | Worker가 요청 주도, 현재 Worker 구조와 유사. Android connector 상시 운영이 미검증 | S21 connector, background, cost, security spike 통과 |
| Public HTTPS endpoint | Worker → S21 public/tunneled HTTPS | 단순한 요청 흐름. public attack surface와 tunnel availability 관리 필요 | strong auth/rate limits/transport security 준비 |
| Outbound node relay | S21 → Worker/relay persistent channel; Worker command/data 전달 | NAT 친화적. reconnect, chunk flow control, relay state 복잡도 증가 | direct inbound가 안 되고 Android outbound service가 더 안정적일 때 |

어떤 profile도 요구조건을 통과하지 못하면 Android-only node는 아직 backend 교체 가능한 후보가 아니다. 이 경우 Supabase backend를 유지하면서 app/Worker에 adapter 경계를 먼저 넣고, Android는 local replica/test target으로 시작한다.

## 인터넷 없는 환경과 USB 연결

인터넷이 없어도 USB 또는 로컬 LAN으로 기기 간 통신할 수 있다. Data Node 저장 API와 이를 운반하는 transport를 분리해 USB/LAN/cloud 경로에서 같은 저장 계약을 사용한다.

완전 오프라인에서는 Cloudflare Worker와 GitHub에 접속할 수 없다. 따라서 Worker가 수행하는 PKMS domain service를 portable application module로 분리하고, 노트북의 local server/Electron main 또는 별도 Android application host에서 실행할 수 있어야 한다. Cloudflare Worker는 그 모듈의 online host가 된다. 현재 `pkms-server`가 이미 offline host에서 실행된다는 뜻은 아니며 auth, credentials, realtime, scheduler와 Cloudflare bindings를 분리하는 구현이 필요하다.

```text
오프라인: 앱 → 로컬 application server → USB/LAN → Android Data Node
온라인:   앱 → Cloudflare Worker       → 원격 연결 → Android Data Node

GitHub export: offline pending → 인터넷 복구 후 예약 batch 재개
```

### USB 개발·개인용 profile

첫 구현 후보는 USB cable과 ADB port forwarding이다. Android Data Node가 기기 loopback의 API port를 열고 노트북에서 `adb forward`를 실행하면 노트북 localhost를 통해 같은 HTTP storage API를 호출할 수 있다. 휴대폰의 private DB/file을 ADB로 직접 열거나 복사하는 방식은 사용하지 않는다. DB/파일의 일관성은 Node API가 관리한다.

설명용 예시(Data Node가 device port 8787에서 실행 중이고 USB 기기가 한 대인 경우):

```sh
adb devices
adb forward tcp:18787 tcp:8787
```

이후 local application server는 `http://127.0.0.1:18787`을 storage endpoint로 사용한다. 아직 이 repository에 해당 Android service/health API는 구현되지 않았다. 여러 기기에서는 serial별 forwarding과 충돌 없는 host port를 관리한다. [ADB port forwarding 공식 문서](https://developer.android.com/tools/adb#set-up-port-forwarding)

USB debugging 활성화와 최초 컴퓨터 RSA key 승인은 사용자 조작이 필요하다. one-click 도구는 승인 이후의 device 탐색, forwarding 생성/복구, endpoint pairing, health/transaction/object round trip, log 수집을 자동화한다. USB 재연결 때 serial과 node identity를 모두 확인하고, 다른 기기에 같은 credential을 잘못 보내지 않는다. USB 경로에서도 application-level node authentication을 유지한다.

### 일반 사용자용 USB와 다른 transport

| 방법 | 적합한 역할 | 제한 |
|---|---|---|
| USB + ADB forward | 개인용 첫 구현, 개발/검증, 노트북↔Android API | Developer options/USB debugging/신뢰할 host 필요 |
| USB Android Open Accessory | USB debugging 없이 앱 전용 통신을 제공할 제품 후보 | Android app와 laptop USB host implementation, framing/flow control, 기기 지원 검증 필요 |
| USB tethering | USB link를 IP network로 제공할 후보 | OS/기기 호환성 검증 필요. Google 안내상 Mac은 Android USB tethering 미지원이므로 Mac 기본 경로로 삼지 않음 |
| Offline Wi-Fi LAN / hotspot | 여러 기기의 HTTP API 통신 | 인터넷 없이 LAN을 구성할 수 있으나 phone hotspot의 무회선 동작/격리 정책은 실기기에서 확인 |
| MTP / export file | 파일 형태의 backup 운반 | live DB/API access나 DB transaction 대체 경로로 사용하지 않음 |

AOA는 laptop이 USB host가 되고 Android app이 accessory connection을 통해 데이터를 주고받는 방식이다. USB debugging 없이 사용할 수 있지만, 기기 지원과 host-side 구현이 필요하므로 ADB profile의 후속 후보로 둔다. [AOA protocol](https://source.android.com/docs/core/interaction/accessories/protocol), [AOA 1.0 및 debug requirements](https://source.android.com/docs/core/interaction/accessories/aoa), [Android USB tethering 제한](https://support.google.com/android/answer/9059108?hl=en-GB)

### Offline acceptance requirements

- 사전 설치된 APK와 desktop application만으로 인터넷 연결 없이 node 시작·pairing·조회·transaction·object upload/download·diagnostics 수행
- GitHub OAuth, Supabase, Cloudflare, public DNS, internet time lookup을 local start의 필수 조건으로 두지 않음
- trusted local device keys와 local permission을 사용하며 cloud login 불가를 이유로 소유한 데이터 접근을 막지 않음
- USB cable removal은 request 실패로 기록하고, 재연결 후 operation ID 조회/재시도로 중복 저장을 방지
- local Git bundle/manifest/object archive를 별도 기기에 복제·복원 가능; online GitHub export는 pending 상태로 유지
- airplane mode 또는 WAN 차단 상태에서 모든 offline acceptance scenario를 실제 기기로 검증

## 인증·보안

- Worker는 PKMS 사용자 인증·권한 검사를 끝낸 뒤 Data Node credential로 요청한다.
- Node는 worker/device identity별 최소 권한 credential을 사용한다. APK에 GitHub client secret, Supabase service role key, 공용 node secret을 내장하지 않는다.
- pairing token은 짧은 시간·1회 사용이며, 이후 per-node secret을 안전하게 보관/회전/폐기한다.
- TLS를 사용하고, 요청 timestamp + nonce/request ID + body hash를 signed request에 넣어 replay를 방지한다. Node는 clock skew와 nonce cache 정책을 제한한다.
- object encryption-at-rest 정책과 key recovery를 별도 결정한다. Android Keystore hardware-bound key만으로 암호화하면 기기 교체/고장 때 복구 불가능해질 수 있으므로 recovery key/export 시나리오를 먼저 정한다.
- logs에는 document bodies, binary, OAuth tokens, node secrets, full signed URLs를 기록하지 않는다. User data의 hash는 필요한 prefix/diagnostic event만 기록한다.
- GitHub export 대상 데이터는 필요하면 client-side encryption을 하며, Git history에서 삭제가 어려운 특성을 UI에 알린다.
- admin API는 별도 capability를 요구하고 destructive delete/format은 감사 event와 추가 확인이 필요하다.

## 로깅·오류 추적·진단은 필수 기능

### 구조화 로그

모든 로그는 JSON Lines로 저장한다. 공통 필드는 `timestamp`, `level`, `component`, `event`, `nodeId`, `requestId`, `operationId`, `traceId`, `stage`, `durationMs`, `result`, `errorCode`, `retryable`, `bytes`, `revision`이다. 필드가 없는 경우 null을 임의로 채우지 않는다.

요청마다 Worker의 request ID를 Node까지 전달하고, operation ID를 DB change log, object staging, outbox, GitHub batch 로그에서 동일하게 사용한다. 사용자 화면에서 operation ID로 한 요청의 전체 경로를 찾을 수 있어야 한다.

### 로그/오류 저장 정책

- local rotating JSONL log; size 및 retention 제한을 사용자가 볼 수 있게 표시
- DB `error_events`에는 error code, stage, redacted message, request/operation ID, stack fingerprint, 발생/재시도 횟수 저장
- process crash 전 상태는 마지막 operation marker를 DB에 남기고 다음 시작 시 crash recovery event로 기록
- 앱 강제 종료/ANR/reboot의 원인은 Android가 제공하는 process-exit 정보 범위에서 수집
- 저장 공간이 부족해 로그를 쓰지 못해도 데이터 commit 경로를 방해하지 않음
- 로컬에서 조회/검색/삭제, redacted zip bundle export 가능
- 외부 crash analytics는 기본 의존성으로 넣지 않음. 향후 opt-in telemetry를 추가할 수 있으나 node 기능은 offline에서도 운영 가능해야 함

### Health 및 diagnostic bundle

`Run Full Validation` 결과는 단계별 PASS/WARN/FAIL과 관측값을 남긴다.

| Check | 검증 |
|---|---|
| Node runtime | service state, uptime, app/build/API version, last start/stop reason |
| Database | schema version, migration status, `PRAGMA integrity_check`, `foreign_key_check`, WAL state/checkpoint result |
| Filesystem | writable, free bytes, staging/final path access, atomic publish behavior |
| Metadata transaction | record create/read/update, conditional version conflict, rollback, duplicate operation idempotency |
| Object store | streamed test object put/head/get/delete, SHA-256 exact match, duplicate object behavior |
| Crash recovery | controlled test staging object + uncommitted metadata fixture 이후 restart reconciliation |
| Outbox/backup | pending count/oldest age, GitHub auth, test export/commit readback, manifest integrity |
| A Quantum replica | pairing, authenticated health, encrypted transfer, hash compare, replica lag |
| Worker route | Worker→Node authenticated request latency/reachability, timeout/retry path |
| Resource limits | free storage threshold, memory peak, CPU/thermal state, active request count |

Diagnostic bundle에는 기밀 데이터가 없어야 한다. bundle manifest에 포함 파일 목록/size/hash를 표시하고, 내보내기 전에 preview를 제공한다. 자동 외부 업로드는 v1에서 하지 않는다.

## 한 번에 실행·테스트·검증

### PC 개발자 흐름

기존 repo에 제안할 entrypoints (설계 대상 이름이며 아직 구현된 command가 아님):

| 명령 | 동작 |
|---|---|
| `npm run data-node:doctor` | Java/JDK, Android SDK, Gradle, adb/device authorization, disk space 확인 후 빠진 조건을 고침 안내 |
| `npm run data-node:one-click` | doctor → debug APK build → 연결된 대상 기기에 install/launch → on-device smoke diagnostics → 결과와 Logcat 저장 |
| `npm run data-node:verify` | unit + adapter contract + SQLite instrumentation + device diagnostics 수행 |
| `npm run data-node:logs` | 최근 worker/device correlation ID 기준 redacted log bundle 수집 |
| `npm run data-node:reset-test-node` | test namespace만 초기화. 실제 사용자 DB나 object data는 절대 삭제하지 않음 |

Mac 환경에서 Android SDK/ADB 도구가 확인된 상태지만, 현재 이 repository에는 Data Node Gradle app 또는 위 명령이 없다. 설계 승인과 implementation 이후 실제 명령으로 제공하며, 그 전에는 실행 가능하다고 표현하지 않는다.

One-click script는 아무 Android device가 연결돼 있다고 가정하지 않는다. 여러 대가 보이면 serial을 보여주고 선택하게 하며 `S21 Ultra`/`A Quantum` label을 등록할 수 있다. debug app install이 사용자 데이터에 영향을 주지 않는 업데이트인지 검사한다. release APK는 따로 build/sign/verify하고 debug credential을 포함하지 않는다.

### 기기 사용자 흐름

APK 설치만으로 Node를 자동 시작하지 않는다. 사용자는 `Start Node`를 눌러야 하며, 첫 실행 wizard에서 저장 공간, Worker pairing, GitHub export 주기, backup destination, 로그 보존을 정한다. 홈 화면은 다음 값을 항상 보여 준다.

- Node 상태/최근 재시작 사유
- DB transaction success/error counters
- objects/count/bytes/free storage
- replication 상태와 A Quantum last ACK
- GitHub last export commit/time/pending age
- 최근 전체 진단 결과 및 exportable diagnostics
- Stop/Start, Run Full Validation, Backup Now, Restore Verification controls

## 테스트·검증 계획

실제 구현 단계에서 아래 테스트를 추가·실행한다. 지금 문서는 계획만 정의한다.

### Adapter contract

- Supabase와 SQLite가 동일 transaction command를 같은 결과로 처리
- idempotency request replay 및 request hash mismatch
- expected revision/version conflict
- atomic batch의 일부 mutation invalid일 때 전체 rollback
- operation 결과/query cursor ordering
- concurrent writer에서 revision 유실 없음

### Object/recovery fault injection

- upload 중 process kill, DB commit 직전/직후 kill, final rename 직전/직후 kill
- same content parallel upload, same object ID conflicting bytes, hash mismatch
- storage full, permissions error, read-only filesystem, corrupt/truncated temp file
- object 없고 metadata만 존재 / metadata 없고 final object만 존재 / reference count 불일치
- database quick/integrity check, WAL restart, schema migration 중 stop/restart

### Backup/restore

- 여러 개 metadata change와 objects를 batch로 export하고 단일 GitHub commit에서 확인
- GitHub timeout, HTTP 403/429, network offline, branch external edit, commit created but response lost
- retry가 중복 commit/잘못된 ACK를 만들지 않는지 확인
- manifest tamper, missing object, object hash mismatch를 탐지하고 activate를 차단
- A Quantum에서 전체 복원하고 원본 hash/reference counts 비교

### Device operation

- 화면 off, 앱 background, Doze, process kill, force stop, reboot, user unlock 전후
- Samsung battery optimization/default policy 및 power saver
- Wi-Fi↔LTE, router restart, Worker tunnel/relay interruption
- 24h soak test, 이후 수 주간 pilot에서 uptime/reconnect/thermal stats 기록
- charging heat와 battery state를 기록. 장기 24/7 판단은 이 테스트를 통과한 뒤에만 한다.

### Usability

- 깨끗한 macOS 개발 환경에서 one-click build/install/verify 성공
- APK 설치 후 서버 시작부터 worker health check까지 단계별 도움 없이 완료
- diagnostic failure가 코드·해결 방법·exportable trace를 제공
- 백업이 없는 상태에서 uninstall/reset 경고가 실제로 보임
- 데이터 손상/backup lag 상태를 Healthy로 잘못 표시하지 않음

## 관측 및 서비스 수준 목표

초기에는 가용성 숫자를 임의로 약속하지 않는다. 검증 화면에서 실제 측정값을 제공하고, 파일럿 뒤 목표를 정한다.

| 지표 | 초기 기준 |
|---|---|
| local metadata commit result | 요청별 committed/rejected, revision, latency 표시 |
| object checksum | 모든 completed upload에서 requested/actual SHA-256 일치 |
| recovery | synthetic crash fixtures 모두 startup 후 resolved/quarantined 상태로 설명 가능 |
| replica lag | 마지막 node ACK 시각, pending bytes/count 표시 |
| GitHub backup lag | 마지막 verified commit과 pending oldest age 표시 |
| observability | 모든 failed operation을 request/operation ID로 log에서 찾기 가능 |
| data loss | ACK한 `local_committed` 요청은 SQLite/file crash recovery 후 결과가 확인 가능; 물리 기기 고장에는 replica/export가 필요 |

RPO는 GitHub export 주기만큼이 아니라 **마지막 확인된 independent replica/export 단계**로 설명한다. A Quantum 없이 S21만 켜져 있고 GitHub export가 하루 주기라면, 그 사이 노드 고장 시 해당 변경은 복구되지 않을 수 있다고 UI에 표현한다.

## 단계별 실행 계획과 통과 기준

### Gate 0 — Android/Worker network spike

- S21 exact Android/One UI version, package target SDK, FGS service policy 확인
- Node process가 user-started FGS에서 화면 off 상태로 지속 가능한지 시험
- Worker → node authenticated health call과 binary chunk round-trip 검증
- 연결 방식/배터리 정책/복구 동작이 요구를 만족하지 못하면 저장 코드에 앞서 network architecture를 다시 선택

### Gate 1 — SQLite MetadataStore vertical slice

- 앱 안 SQLite와 generic record transaction API
- operation ID, version check, change log, migration, integrity diagnostics
- One-click local test 및 crash/restart verification

### Gate 2 — Filesystem ObjectStore vertical slice

- stream upload, staging, hash, final publish, recovery
- Android filesystem behavior와 low storage 처리
- ObjectStore contract에 맞춘 Worker forwarding

### Gate 3 — Worker adapter + security + correlation

- Worker API가 provider-neutral MetadataStore/ObjectStore ports 사용
- auth/pairing/credential rotation, request IDs, structured log
- route failure와 node unavailable semantics

### Gate 4 — backup/export 및 A Quantum

- scheduled GitHub export, manifest/readback, restore verification
- node-to-node backup, hash ACK, lag display

### Gate 5 — migration/profile replacement

- Supabase implementation을 같은 ports 아래 보존
- shadow compare/dual-read/controlled data migration
- restore proof 후 한 capability씩 Android backend로 전환
- Supabase stop은 metadata, object, realtime, credentials, account state 및 rollback 계획을 각각 검증한 뒤 수행

## 핵심 리스크와 완화

| 위험 | 영향 | 완화/검증 |
|---|---|---|
| Worker가 S21에 접근 못 함 | 전체 API 저장 불가 | Gate 0에서 tunnel/VPC/relay 실증; 이 gate 실패 시 진행 범위 재정의 |
| Android가 service 종료 | node offline, 요청 지연 | user-started FGS, visible notification, restart/resume, status & retry, soak tests |
| 앱 제거/초기화로 private storage 삭제 | 전체 로컬 복사 손실 | replica/export 확인과 uninstall guard, restore drill |
| SQLite/file cross-store 실패 | dangling record/object | explicit state machine, outbox, scrub/reconcile, quarantine |
| Supabase/SQLite semantic 차이 | migration 이후 데이터 오류 | provider contract test와 shadow compare |
| Realtime 유실/순서 차이 | UI stale state | revision cursor, durable replay, realtime advisory-only |
| GitHub quota/branch conflict | backup delay | batch commit, backoff, export status, no local data deletion |
| credential 탈취 | 저장소 노출/변조 | scoped worker credential, pairing, TLS, rotation, redacted logs |
| 배터리 열/기기 고장 | uptime/수명 저하 | measured power/thermal pilot, A Quantum replica, clear durability status |

## 관련 근거

- Current implementation: [SupabaseVault.ts](../../../apps/pkms-server/src/SupabaseVault.ts), [Supabase request adapters](../../../apps/pkms-server/src/supabase.ts), [SQLite/Postgres atomic write migration](../../../apps/pkms-server/supabase/migrations/20261101130000_atomic_document_write.sql), [R2 binding](../../../apps/pkms-server/wrangler.jsonc), [PKMS integration](../../architecture/07-pkms-integration.md).
- Android foreground service timeouts/type requirements: [Android Developers — FGS timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout), [service types](https://developer.android.com/develop/background-work/services/fgs/service-types).
- Android transaction/WAL and storage lifecycle: [SQLiteDatabase API](https://developer.android.com/reference/android/database/sqlite/SQLiteDatabase), [SQLite best practices](https://developer.android.com/topic/performance/sqlite-performance-best-practices), [app-specific storage](https://developer.android.com/training/data-storage/app-specific).
- Realtime message model: [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast).
- Worker private reachability: [Cloudflare Workers VPC networks](https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/), [Tunnel](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/), [setup](https://developers.cloudflare.com/workers-vpc/get-started/).

## 최종 제안

Android Data Node는 “PKMS를 폰으로 옮긴 서버”가 아니라 **Worker 뒤에서 generic storage를 제공하는 사용자 소유 infrastructure node**로 설계한다. Worker가 DB/object transaction API를 호출하고, Node는 SQLite+filesystem의 raw persistence를 제공한다. GitHub는 주기적인 batch backup/export이고, A Quantum은 별도 복구 사본이다.

구현 순서는 network reachability와 Android runtime feasibility를 먼저 입증하고, 그 다음 SQLite transaction, object recovery, Worker adapter, observability/one-click validation, backup/replication으로 진행한다. SQLite는 엔진으로 재사용하고, 아래부터 직접 설계할 대상은 generic data model, command semantics, object durability state machine, provider conformance, error/diagnostic contract다.
