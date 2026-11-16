# PKMS Data Node — 전체 프로젝트 인수인계 문서

> **권장 방향:** 기존 엔진을 재사용해 PKMS 전용 Android APK를 직접 개발한다.  
> **목표 기기:** Samsung Galaxy S21 Ultra  
> **핵심 목표:** APK 설치 후 실행만으로 독립형 PKMS 저장 노드를 운영한다.

---

## 1. 프로젝트 개요

PKMS Data Node는 S21 Ultra를 PKMS 전용 독립 데이터 저장 서버로 사용하는 프로젝트다.

단순히 Android에서 DB를 실행하는 것이 목적이 아니다. DB Metadata와 원본 파일을 하나의 저장 시스템으로 관리하고, 외부 Backend와 Worker가 교체되어도 데이터가 유지되도록 한다.

### 핵심 요구사항

1. Backend와 Worker가 교체되어도 저장 데이터는 유지한다.
2. DB Metadata와 Object 파일의 상태를 일치시킨다.
3. SHA-256 기반 무결성 검증 및 중복 제거를 지원한다.
4. Zstandard 무손실 압축을 지원한다.
5. 장애 발생 후 미완료 작업을 탐지하고 복구한다.
6. NAS 또는 일반 Linux 서버로 이전할 수 있도록 저장 인터페이스를 표준화한다.
7. 사용자가 Android에서 Termux나 Linux 환경을 수동으로 설치하지 않도록 한다.
8. 개발과 검증은 PC에서 하고 최종 결과물만 APK로 배포한다.

### 시스템 역할

| 구성                | 역할                  |
| ------------------- | --------------------- |
| S21 Ultra           | 영구 데이터 저장 노드 |
| Backend             | 비즈니스 로직         |
| Crawler             | 웹 데이터 수집        |
| Parser              | 데이터 구조화         |
| Collector           | 수집 데이터 전달      |
| Worker              | 비동기 작업 및 처리   |
| PC                  | 개발 및 테스트 환경   |
| NAS / PC / 외장 HDD | 독립 백업             |

Backend와 Worker는 클라우드, PC, 다른 서버 어디서든 실행할 수 있다. S21 Ultra는 데이터 저장을 책임지는 독립 노드다.

---

## 2. 기존 Android 서비스 조사 결과

지금까지 살펴본 후보는 PocketCode, HostPilot, ADBA, Pocket Server다. 기존 제품 하나를 설치하는 것만으로 PKMS 요구사항 전체가 충족되는지는 아직 검증되지 않았다.

### A. PocketCode

공식 페이지: <https://www.pocketcodeapp.com/en/run/postgresql-on-android>

앞서 조사한 제품 설명 기준:

- Android에서 PostgreSQL 18.2 실행
- Root 불필요
- 로컬 DB 실행 및 관리 도구
- Linux 터미널 및 개발 도구 제공

장점:

- Android에서 실제 PostgreSQL을 실행하는 기술 검증에 유용하다.
- PostgreSQL 자체를 직접 포팅할 필요가 없다.

미확인 또는 제한:

- 외부 Worker가 접속하는 상시 네트워크 DB 서버로 운영 가능한지 확인 필요
- Android 백그라운드에서 프로세스가 종료될 가능성
- PKMS Object Storage, Deduplication, Zstd, Recovery, 통합 Storage API는 별도 구현 필요

**평가:** 완제품보다는 Android PostgreSQL 실행 가능성 검증용 후보.

### B. HostPilot

공식 페이지: <https://cosmovex.web.app/apps/hostpilot>

앞서 확인한 설명 기준:

- PHP 실행 환경
- SQLite
- 브라우저 기반 관리
- 파일 업로드 서버
- Foreground Service 지원

장점:

- Android에서 DB와 파일 서버를 함께 운영할 가능성이 있다.
- 프로토타입을 빠르게 시험할 수 있다.

미확인 또는 제한:

- PKMS 전용 API 및 데이터 정합성 기능은 별도 검증 필요
- SHA-256 Deduplication, Zstd, 복구 엔진이 기본 제공된다고 확인되지 않음
- 장시간 외부 서버 운영 안정성 확인 필요

**평가:** 프로토타입 후보지만 PKMS 완제품으로 보기에는 기능 검증이 필요하다.

### C. ADBA — Android Database Application

GitHub: <https://github.com/Garletz/ADBA-ANDROIDATABASE>

앞서 조사한 프로젝트 설명 기준:

- Rust
- Axum
- SQLite
- React
- Tauri
- REST API
- LAN 접근

README에 프로젝트 중단 및 PoC 상태가 명시된 것으로 조사되었다.

**평가:** 운영 기반으로 사용하기보다는 Android DB 서버의 개념과 API 설계를 참고하는 용도.

### D. Pocket Server

GitHub: <https://github.com/saketkhundia/Pocket-Server>

앞서 확인한 기능:

- 파일 업로드
- 파일 다운로드
- 디렉터리 관리
- 파일 검색
- 스트리밍 전송
- 브라우저 관리 화면

DB 기능보다는 Object Storage의 파일 전송 부분을 참고하기 적합하다.

### 기존 제품 비교

| 제품          | DB         | 파일 서버   | 통합 API  | PKMS 적합성 |
| ------------- | ---------- | ----------- | --------- | ----------- |
| PocketCode    | PostgreSQL | 별도 구현   | 제한적    | 부분 활용   |
| HostPilot     | SQLite     | 가능성 있음 | 별도 확인 | 부분 활용   |
| ADBA          | SQLite     | 미흡        | REST      | PoC         |
| Pocket Server | 없음       | HTTP        | 파일 API  | 부분 활용   |

**조사 결론:** 기존 제품을 설치하는 것만으로 다음 기능을 하나의 운영 가능한 시스템에서 모두 제공하는 후보는 아직 검증하지 못했다.

- 영구 파일 저장
- DB Metadata 관리
- SHA-256 기반 Deduplication
- Zstd 압축
- 파일과 DB의 상태 정합성
- 장애 복구
- Garbage Collection
- 원격 API
- 독립 백업

따라서 기존 제품을 무리하게 조합하기보다 전용 앱을 개발하는 방안을 우선 추천한다. 다만 구현 전에 각 후보의 최신 버전, 라이선스, 실제 기기 호환성을 재확인한다.

---

## 3. 최종 권장 기술 아키텍처

기존 설계에서 개선할 부분은 FastAPI 대신 Kotlin 기반 Ktor를 사용하는 것이다. Android APK와 서버 코드를 동일한 Kotlin 생태계에서 관리할 수 있고, Android에 별도 Python 런타임을 포함할 필요가 없다.

### 구성

| 영역           | 기술              | 상태      |
| -------------- | ----------------- | --------- |
| Android 앱     | Kotlin            | 권장      |
| Android UI     | Jetpack Compose   | 권장      |
| Server API     | Ktor              | 권장      |
| Metadata DB    | SQLite            | 초기 선택 |
| Object Storage | Filesystem        | 초기 선택 |
| Compression    | Zstandard         | 권장      |
| Hash           | SHA-256           | 채택      |
| Network        | Tailscale         | 채택 방향 |
| Development    | Docker Compose    | 채택      |
| Testing        | Integration Tests | 채택      |
| Deployment     | APK               | 목표      |

PostgreSQL은 초기 필수 구성에서 제외한다. 필요하면 Linux/NAS 환경에서 별도 구현으로 도입하되 외부 API 계약은 유지한다.

### 논리 아키텍처

```text
External Backend / Workers
  Crawler · Parser · Collector · Processor
                |
          HTTPS / Tailscale
                |
       PKMS Data Node (APK)
                |
           Ktor Storage API
       Upload / Download / Search
                |
       +--------+---------+
       |                  |
  Metadata DB        Object Storage
    SQLite             Filesystem
       |                  |
       +--------+---------+
                |
           Storage Core
      SHA-256 · Zstd · Dedup
                |
          Recovery Engine
 Integrity · Recovery · Garbage Collection
                |
        Independent Backup
          PC / NAS / HDD
```

---

## 4. 저장 시스템 설계

### 디렉터리 구조 예시

Android 앱의 전용 영구 저장 영역 아래에 다음 구조를 둔다.

```text
PKMS/
├── database/
│   └── pkms.db
├── storage/
│   └── objects/
│       ├── 00/
│       ├── 01/
│       ├── 02/
│       └── ...
├── staging/
│   └── uploads/
├── quarantine/
├── logs/
└── backup/
```

Android에서는 실제 경로를 앱의 내부 파일 디렉터리 또는 앱 전용 외부 저장 영역으로 추상화한다.

앱 업데이트로 데이터가 삭제되지 않도록 해야 한다. 다만 앱 제거 시 앱 전용 데이터가 함께 삭제될 수 있으므로, 제거·초기화 전에 백업하도록 안내해야 한다.

### Object 저장 방식

원본 데이터의 SHA-256을 기준으로 객체를 식별한다.

예시:

```text
Original SHA-256:
a3f81c9d...

Object Path:
storage/objects/a3/a3f81c9d....zst
```

DB에는 다음 정보를 보관한다.

- 원본 SHA-256
- 압축 파일 SHA-256
- 원본 크기
- 압축 크기
- 압축 방식 및 버전
- 객체 경로 또는 상대 키
- 저장 상태
- 생성 시간

원본 해시와 압축 파일 해시는 반드시 분리한다.

### 초기 DB 테이블

| 테이블               | 용도                     |
| -------------------- | ------------------------ |
| objects              | 원본 객체 정보           |
| documents            | 문서 Metadata            |
| ingestion_jobs       | 수집 작업 상태           |
| object_references    | 객체 참조 관계           |
| storage_transactions | 파일과 DB 상태 전이 관리 |
| schema_migrations    | DB 스키마 버전 관리      |
| backup_records       | 백업 이력                |
| integrity_checks     | 무결성 검사 결과         |

### 파일과 DB 정합성

파일 시스템과 DB는 하나의 원자적 트랜잭션을 공유하지 않는다. 따라서 저장 과정을 명시적인 상태 전이로 관리한다.

```text
UPLOAD
  |
  v
STAGING
  |
  v
HASH CALCULATION
  |
  v
DEDUP CHECK
  |
  v
ZSTD COMPRESSION
  |
  v
ATOMIC FILE MOVE
  |
  v
DB TRANSACTION
  |
  v
COMMITTED
  |
  v
SUCCESS RESPONSE
```

실패 시 처리 원칙:

- DB 기록이 없는 파일은 고아 객체 후보로 분류한다.
- 파일이 없는 DB 객체는 손상 상태로 표시한다.
- 미완료 업로드는 재시도하거나 정리한다.
- 참조 중인 객체는 Garbage Collection 대상에서 제외한다.
- 객체 삭제는 참조 수와 유예 기간을 확인한 뒤 수행한다.
- 중복 해시가 발견되어도 기존 객체를 무조건 덮어쓰거나 삭제하지 않는다.

성공 응답은 파일의 영구 저장과 DB 커밋이 확인된 이후에만 반환한다.

---

## 5. Storage API

Worker가 호출하는 API 계약은 처음부터 고정한다.

| Method | Endpoint                    | 기능              |
| ------ | --------------------------- | ----------------- |
| POST   | `/v1/objects`               | 객체 업로드       |
| GET    | `/v1/objects/{id}`          | 객체 다운로드     |
| HEAD   | `/v1/objects/{id}`          | 존재 여부 및 크기 |
| GET    | `/v1/documents/{id}`        | 문서 조회         |
| POST   | `/v1/documents/search`      | 문서 검색         |
| GET    | `/v1/health`                | 상태 확인         |
| POST   | `/v1/admin/verify`          | 무결성 검사       |
| POST   | `/v1/admin/recovery`        | 복구 작업         |
| GET    | `/v1/stats`                 | 저장 통계         |
| GET    | `/v1/objects/{id}/metadata` | 객체 Metadata     |
| POST   | `/v1/admin/backup`          | 백업 실행         |
| GET    | `/v1/admin/jobs`            | 작업 상태         |

저장 구현과 API 계층은 분리한다.

예시 인터페이스:

```kotlin
interface ObjectStorage {
    suspend fun put(
        input: InputStream,
        metadata: ObjectMetadata
    ): StoredObject

    suspend fun get(
        objectId: String
    ): InputStream

    suspend fun exists(
        objectId: String
    ): Boolean

    suspend fun delete(
        objectId: String
    )
}
```

Android에서는 Filesystem 구현을 사용하고 Linux/NAS에서는 같은 인터페이스의 다른 구현을 사용할 수 있도록 한다.

API 버전과 객체 식별 규칙은 플랫폼에 종속되지 않게 설계한다.

---

## 6. 개발 및 검증 환경

**S21 Ultra에서 직접 개발하지 않는다.** PC에서 개발하고 Docker Compose로 시뮬레이션한다.

### 권장 프로젝트 구조

```text
pkms-data-node/
├── android-app/
├── storage-core/
├── storage-api/
├── simulator/
│   ├── docker-compose.yml
│   ├── test-workers/
│   └── test-data/
├── tests/
│   ├── upload/
│   ├── dedup/
│   ├── integrity/
│   ├── recovery/
│   ├── concurrency/
│   └── backup/
├── docs/
└── README.md
```

PC와 Android가 동일한 Storage Core 코드를 공유한다. 차이는 저장 경로 구현과 Android 생명주기 관리에 한정한다.

### 필수 시뮬레이션

| 테스트        | 검증 내용            |
| ------------- | -------------------- |
| 일반 업로드   | 파일 저장 및 DB 기록 |
| 중복 업로드   | 객체 중복 제거       |
| 동시 업로드   | 1~20 Worker          |
| 대용량 업로드 | 메모리 안정성        |
| 강제 종료     | 미완료 업로드 복구   |
| DB 오류       | 파일 고아 탐지       |
| 파일 손상     | SHA-256 불일치 검출  |
| 백업          | 전체 데이터 복원     |
| API 재시도    | Idempotency          |
| 장시간 운영   | 메모리 및 안정성     |

Docker는 개발용 시뮬레이터다. Android의 배터리 관리, 앱 생명주기, 저장소 동작을 완전히 재현하지 못하므로 최종적으로 S21 Ultra 실기기 테스트가 필요하다.

---

## 7. Android 배포 구조

최종 결과물은 `PKMS Data Node.apk`다.

목표 사용자 흐름:

1. APK 설치
2. 최초 실행 및 저장 공간 설정
3. 필요한 Android 권한 안내
4. Start Server 버튼
5. Tailscale 연결
6. 외부 Worker에서 API 호출

### 목표 UI

- Start Server
- Stop Server
- Storage Usage
- Object Browser
- Integrity Check
- Backup
- Server Logs
- Network Status

### Android 운영 제약

- Foreground Service 사용 및 지속 알림
- Android 버전에 맞는 서비스 유형과 권한 설정
- 배터리 최적화 예외 안내
- 재부팅 후 자동 복구 가능성 검토
- 저장소 여유 공간 및 파일 시스템 오류 처리
- 앱 업데이트 시 데이터 보존
- DB와 Object Storage의 별도 백업
- Android 프로세스 강제 종료 후 복구

Android는 일반 Linux 서버가 아니며 24시간 무중단을 보장하지 않는다. S21 Ultra에서 장시간 운영, 재부팅, 발열, 충전 상태, 백그라운드 제한을 검증해야 한다.

Tailscale을 앱에 직접 내장할지, 별도 Tailscale 앱과 연동할지는 구현 복잡도와 Android VPN 권한 정책을 확인한 뒤 결정한다.

---

## 8. 이전 및 확장 전략

목표는 Android 전용 저장소에 종속되지 않는 것이다.

```text
             PKMS Storage API
             동일한 API 계약
                    |
          +---------+---------+
          |         |         |
       Android    Linux      NAS
       S21 Ultra  Server    Storage
```

이전 절차:

1. DB Export 또는 마이그레이션
2. Object 파일 복사
3. 객체 해시 검증
4. 새 저장소에서 API 실행
5. Worker 연결 주소 변경

Worker는 저장 노드의 내부 DB나 파일 경로를 알 필요가 없어야 한다.

---

## 9. 확정 사항과 미결정 사항

### 확정된 방향

- S21 Ultra를 PKMS Data Node로 사용
- 독립적인 데이터 영구 보관
- 외부 Backend / Worker 분리
- Object Storage와 Metadata DB 결합
- SHA-256 기반 식별 및 중복 제거
- Zstandard 무손실 압축
- Storage API 표준화
- PC 중심 개발
- Docker Compose 시뮬레이션
- 최종 Android APK 배포
- NAS/Linux 이전 가능성 확보
- 루팅 및 Termux 수동 설치를 요구하지 않는 방향

### 미결정 사항

| 항목                | 현재 상태              |
| ------------------- | ---------------------- |
| DB                  | SQLite 우선 제안       |
| API                 | Ktor 우선 제안         |
| Android UI          | Jetpack Compose 제안   |
| Object 최대 크기    | 미정                   |
| 동시 업로드         | 2~5개 임시 기준        |
| 보관 기간           | 영구 보관 임시 기준    |
| S21 저장 용량       | 미확인                 |
| 백업 장치           | 미정                   |
| 인증 방식           | API Token 제안         |
| 저장 데이터 암호화  | 미정                   |
| Tailscale 연동 방식 | 미정                   |
| 자동 시작 정책      | Android 제약 검토 필요 |

---

## 10. 개발 로드맵

| 순서 | 작업                      | 결과물            |
| ---- | ------------------------- | ----------------- |
| 1    | 프로젝트 초기화           | Git Repository    |
| 2    | Storage Core              | 공통 저장 엔진    |
| 3    | SQLite Schema             | Metadata DB       |
| 4    | Filesystem Object Storage | 파일 저장         |
| 5    | SHA-256 / Zstd            | 중복 제거 및 압축 |
| 6    | Ktor API                  | REST API          |
| 7    | Docker Compose Simulator  | 개발 시뮬레이터   |
| 8    | Automated Tests           | 검증 시스템       |
| 9    | Android Integration       | APK               |
| 10   | S21 Ultra Testing         | 실기기 검증       |
| 11   | Tailscale                 | 외부 연결         |
| 12   | Backup / Recovery         | 데이터 보호       |
| 13   | Stress Test               | 장기 운영 검증    |

---

## 11. 다음 대화에서 수행할 작업 지시

먼저 전체 기술 설계를 검토하고 실제 구현 가능한 프로젝트 구조와 모듈 간 의존성을 확정한다.

그다음 다음 순서로 개발한다.

1. Git 프로젝트 초기화
2. Storage Core
3. SQLite Schema
4. Filesystem Object Storage
5. SHA-256 / Zstd
6. Ktor Storage API
7. Docker Compose Simulator
8. Automated Integration Tests
9. Android Application Integration
10. APK Build
11. S21 Ultra 실기기 테스트
12. Tailscale 연결
13. Backup / Recovery

각 단계에서 실행 가능한 코드를 제공하고 테스트 결과를 검증한다. 처음부터 모든 코드를 한꺼번에 생성하지 말고 단계별로 실제 동작을 확인한다.

기존 제품으로 해결할 수 있는 부분은 재사용하되 PKMS 고유의 저장 및 복구 로직은 직접 구현한다.

**최종 목표:** S21 Ultra를 NAS 또는 일반 Linux 서버로 교체해도 Worker와 Storage API 계약을 유지할 수 있는 독립형 PKMS Data Node.

---

## 12. 최종 판단

이 프로젝트의 핵심은 Android에서 PostgreSQL을 실행하는 것 자체가 아니다.

진짜 핵심은 다음 세 가지다.

1. **Storage Core:** 데이터를 안전하게 저장하는 엔진
2. **Storage API:** 외부 시스템과 연결되는 표준 인터페이스
3. **Recovery Engine:** 장애가 발생해도 데이터 정합성을 복구하는 엔진

이 세 가지를 제대로 만들면 Android는 하나의 실행 플랫폼에 불과하다. 나중에 S21 Ultra에서 NAS로 이전해도 PKMS 전체를 다시 개발할 필요가 없다.

**최종 추천: 검증된 DB·압축·해시 엔진을 재사용하고, PKMS 전용 Android APK를 직접 개발한다.**
