# GitHub Repository를 범용 DB + Object Storage로 쓸 수 있는가?

조사일: 2026-11-08  
적용 상황: 사용 가능한 기기는 Galaxy S21 Ultra와 Galaxy A Quantum이며, PC/NAS는 없음. 향후 PKMS도 이 기반 계층 위에 올리는 것을 고려한다.

## 결론

범용 기반을 **DB + Object Storage**로 추상화하는 방향은 타당하다. 다만 GitHub 저장소는 **저부하 개인 프로젝트의 버전 관리형 원격 백업**으로는 쓸 수 있어도, 범용 DB나 Object Storage 그 자체 또는 상시 API 서버로 삼기에는 부적합하다.

GitHub Repository는 상시 실행되는 서버/API가 아니다. GitHub API로 파일을 읽고 쓰거나 Git으로 clone/push하는 원격 버전 저장소다. 따라서 일반적인 SQL/문서 질의 DB나 `PUT /objects/{key}` 같은 Object Storage API를 직접 제공하지 않는다. S21 앱이 GitHub에 저장할 내용을 커밋하고 조회하는 adapter를 구현할 수는 있지만, 이는 DB/Object Storage 대신 Git 커밋·브랜치·API 제한을 운영하는 설계가 된다.

두 기기만 있는 상황에서 현실적인 역할은 아래와 같다.

- **S21 Ultra:** 주 수집 노드와 로컬 저장
- **A Quantum:** S21에서 복제본을 수신하고, 가능하면 GitHub로 암호화된 중요 데이터/manifest를 추가 백업
- **GitHub:** 코드·스키마·설정·작은 문서·manifest와 선별된 암호화 백업 보관

GitHub를 A Quantum 대신 유일한 백업으로 두지 않는다. GitHub 계정 잠금, 저장소 삭제, API 차단, 잘못된 커밋 또는 credential 탈취가 별도 장애 경로가 되기 때문이다.

## GitHub 저장소의 구조와 PKMS 요구 간 차이

Git은 파일 트리의 버전과 커밋을 보관한다. 커밋 이후 객체는 새 버전으로 쌓이고, 파일을 지워도 과거 커밋의 데이터는 history에 남는다. 변경 이력·감사·특정 시점 복원에는 장점이 있지만, 지속적으로 들어오는 원본 객체에 대해 만료, 참조 카운트, garbage collection, lifecycle, RPO/RTO를 제공하는 Object Storage와는 다르다.

GitHub의 Git Blob REST API는 개별 Blob을 읽고 쓸 수 있지만 최대 100 MB다. Contents API는 1 MB 이하에서 모든 기능을 지원하고, 1–100 MB에서는 제한된 응답 형식만 지원하며, 100 MB 초과는 지원하지 않는다. 디렉터리 Contents 조회도 최대 1,000 항목 제한이 있다. [Git Blobs API](https://docs.github.com/en/rest/git/blobs), [Repository Contents API](https://docs.github.com/en/rest/repos/contents)

GitHub는 저장소의 압축된 `.git` on-disk 크기로 10 GB 이하를 권장한다. 개별 객체는 1 MB 이하를 권장하고 100 MB에서 제한하며, push는 최대 2 GB, 저장소별 push는 분당 6회 권장이다. 잦은 ingest나 수많은 작은 객체 저장은 이 사용 패턴과 충돌한다. [GitHub Repository limits](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/repository-limits)

Git LFS는 일반 Git 객체 대신 포인터를 저장하고 실제 파일은 LFS 저장소에 보관한다. 따라서 clone만으로 전체 백업을 얻는 Git의 특성이 달라지고, 별도 저장·대역폭 quota를 고려해야 한다. GitHub Free의 포함량은 현재 월 10 GiB 저장 공간과 10 GiB 다운로드 대역폭이며, 한 파일을 수정해 다시 올릴 때 파일 전체 새 버전이 저장 사용량에 추가된다. Free 포함량을 넘으면 결제 설정에 따라 사용이 차단되거나 과금된다. Free/Pro 단일 LFS 파일 한도는 2 GB다. [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage), [Git LFS 요금·사용량](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)

REST API는 인증 요청 기본 5,000회/시간이지만, 별도로 콘텐츠 생성 요청은 일반적으로 분당 80회·시간당 500회 이하 제한이 있고, GitHub는 abuse 방지를 위한 secondary rate limit도 적용한다. 공식 문서는 이 제한이 바뀔 수 있다고 안내한다. 작은 파일도 하나씩 커밋하면 데이터 자체보다 commit/API 횟수가 병목이 될 수 있다. [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## 데이터 유형별 적합성

| 데이터 | GitHub 적합성 | 판단 |
|---|---:|---|
| PKMS 소스 코드, schema, migration, 설정 템플릿 | 높음 | GitHub의 본래 용도 |
| 작은 Markdown/JSON metadata snapshot | 중간~높음 | 낮은 빈도로 묶어 커밋하고, 비밀정보를 제외하면 사용 가능 |
| 수 KB~수백 KB 문서 원본 | 중간 | 파일 수·수정 빈도를 제한하고 암호화/민감도 고려 필요 |
| 대량 이미지, 오디오, 비디오, PDF 원본 | 낮음 | 저장소 성장과 clone/push 비용, 개별 크기 제한으로 부적합 |
| SQLite DB 파일을 매 변경마다 커밋 | 낮음 | DB 전체 파일 버전이 누적되고 WAL 일관성 문제도 별도로 남음 |
| SQLite 온라인 백업으로 만든 주기별 snapshot | 제한적 | 소규모·저빈도 백업에만 고려. 객체와 snapshot을 함께 복원해야 함 |
| 고빈도 Worker ingest / 다중 writer | 매우 낮음 | rate limit, branch ref 경쟁, 충돌/재시도 때문에 부적합 |
| 상시 조회·검색 API | 부적합 | Repository에는 PKMS 검색/쓰기 서버 프로세스가 없음 |

Git의 객체 데이터 모델은 동일한 바이트의 Blob 재사용을 할 수 있지만, 파일을 조금 바꾸면 새 Blob이 생긴다. 압축·암호화된 객체는 변경 때마다 바이트가 달라지는 경우가 많으므로, PKMS의 SHA-256 dedup과 Git 저장소 dedup이 동일하게 동작한다고 가정하지 않는다. 삭제도 Git history에서 자동으로 물리 삭제하지 않는다.

## 접근·보안·운영 고려

1. **Private repository는 암호화 저장소가 아니다.** GitHub 계정과 토큰 접근이 허용된 주체는 파일을 읽을 수 있다. 민감하거나 개인적인 원본은 클라이언트에서 암호화한 뒤 올리고, 암호화 키는 저장소와 분리해야 한다.
2. **토큰을 APK에 내장하지 않는다.** APK에서 추출 가능한 장기 비밀값을 공용 앱에 넣지 않는다. 사용자 전용 fine-grained token을 쓴다면 지정한 private repo 하나, Contents write/read 최소 권한으로 제한하고 Android Keystore로 보호하며 회전/폐기 경로를 둔다. 노출 시 과거 Git history 전체도 위험하다고 간주한다.
3. **동시 작성은 피한다.** Contents API로 같은 branch/file을 갱신하는 복수 writer는 이전 파일 SHA/branch head 기반으로 갱신하기 때문에 경쟁 시 충돌과 재시도가 생길 수 있다. Git Data API로 tree/commit을 만들어도 branch ref 갱신 경쟁은 남는다. 일단 한 기기만 writer로 하고 다른 기기는 읽기/복원 검증 역할을 맡는다.
4. **부분 백업을 성공으로 오인하지 않는다.** 파일 commit은 성공했어도 manifest가 누락될 수 있다. batch ID, 전체 manifest, 원본 hash, 완료 표식을 사용하고, 백업 후 다른 기기에서 실제 다운로드·복원·해시 검증을 한다.
5. **개인정보와 삭제 요건을 고려한다.** Git history는 수정/삭제한 옛 버전을 보유한다. 민감한 내용을 한 번 커밋하면 단순 파일 삭제로 과거 데이터가 제거되지 않는다. 비밀값·토큰·삭제 요청이 예상되는 원본을 평문으로 올리지 않는다.
6. **네트워크/API 가용성에 종속된다.** GitHub 장애나 제한 초과 중에는 remote write가 실패한다. 로컬 staging queue, backoff, 재시도, idempotency, quota 모니터링이 필요하며, 업로드 완료 응답과 remote replication 완료 응답은 분리해야 한다.

## 실제 적용 사례와 연구

- **GitHub Contents API를 작은 개인 앱의 JSON 파일 저장에 사용한 사례:** 2026년 개인 개발 글은 private repo에서 `contacts.json`, `notes.json` 등 작은 JSON 파일을 읽고 교체하는 개인 vault 구조를 소개한다. 변경 이력과 복구 편의가 장점이지만, 저빈도·소규모 단일 사용자 use case이며 본인 인증 서버와 서버 측 credential을 별도로 둔다. 이는 PKMS 대량 원본 저장에 대한 검증은 아니다. [GitHub as a Database 사례](https://deepaksilaych.me/blog/github-as-database)
- **LHCb Git Conditions Database:** CERN LHCb는 제한된 조건 데이터/XML 계층에 Git bare repository를 SQLite 대안으로 실제 적용했다. 파일 기반 데이터, 버전 관리, incrementally replicated clone이 맞는 문제였고, 논문도 극도로 큰 DB로 쉽게 확장되지 않는다는 한계를 인정한다. 이는 적은 수의 구조화된 버전 파일에는 Git이 유효할 수 있다는 근거이나, GitHub API를 Object Storage로 쓰는 사례와는 다르다. [논문](https://doi.org/10.1051/epjconf/201921404037)
- **GitHub 공식 권고:** 생성된 파일은 Git 밖의 object storage에 둘 것을 권장하며, repository size와 object/push/read rate 상한도 안내한다. PKMS처럼 자동 생성된 데이터와 원본 binary가 계속 쌓이는 용도를 repo 중심으로 설계하지 말라는 직접적인 신호다. [Repository limits](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/repository-limits)

## 권장 범용 구조: GitHub를 Control/Backup Plane으로 한정

```text
Applications / Workers (PKMS is one possible application)
        |
        v
S21 Ultra: generic Storage API + local object store + metadata DB
        |
        +---- replicate objects + manifest ----> A Quantum: second phone copy
        |
        +---- encrypted, selected snapshots ----> Private GitHub repo
                                                   code/schema/manifests/small docs
```

GitHub에는 아래만 저장하는 것을 권장한다.

- 앱 코드, API 계약, schema/migration, 운영 문서
- 백업 snapshot의 manifest: object ID, 원본 SHA-256, 크기, codec/version, 백업 batch/time
- 꼭 보존할 소량 문서나 metadata의 클라이언트 암호화본
- 작은 SQLite online backup을 낮은 빈도로 남길 경우, 별도 복원 검증 후 선택적으로

GitHub에 대량 원본 Object를 계속 넣거나, A Quantum을 대체하는 sole copy로 쓰는 것은 권장하지 않는다. GitHub private repository는 일반적인 파일 서버/API endpoint도 아니므로 애플리케이션은 GitHub를 직접 storage node로 취급하기보다 S21의 범용 Storage API를 호출하고, S21의 백업 작업이 GitHub로 export하는 구조가 낫다.

## 기기 두 대만으로 시작하는 실행안

1. S21과 A Quantum이 각각 로컬 파일을 저장할 수 있는지, 여유 용량과 배터리/열 조건을 확인한다.
2. S21에 PKMS API를 두고, A Quantum은 HTTPS/Tailscale 또는 사설망으로 S21에서 받은 복제물을 저장하는 단순 receiver로 시작한다.
3. 범용 metadata schema/API 계약과 manifest는 private GitHub repo에 둔다. 특정 PKMS 문서 모델은 이 기반 위의 별도 schema/module이 된다. 원본 중 중요도가 높은 작은 데이터만 클라이언트 암호화 후 주기적으로 export한다.
4. GitHub로 백업할 때 파일 하나씩 즉시 commit하지 말고, 크기·수량 제한 내에서 일별/주별 snapshot batch로 묶는다. 파일 크기는 보수적으로 1 MB 이하를 기본 목표로 삼는다.
5. A Quantum과 GitHub 각각에서 데이터 복원이 가능한지 확인한 후에만 백업 완료로 표시한다.
6. S21, A Quantum, GitHub 세 위치의 hash를 비교하고, 어느 한 복제본이 빠져도 복구되는지 주기적으로 확인한다.

## 기반 계층과 PKMS의 관계

범용 계층을 먼저 만들면 PKMS 구현의 큰 토대가 생긴다.

```text
PKMS (도메인 데이터 모델, 수집·정규화·검색 규칙)
                         |
          Generic metadata DB + Object Storage
          API · hash · dedup · compression
          transactions · recovery · backup
                         |
        Android / Linux / NAS storage adapters
```

DB + Object Storage가 완성되면 PKMS가 “자동으로 전부 구현됐다”기보다는, PKMS가 데이터를 영속화하는 기반이 완성된 것이다. PKMS에는 어떤 문서를 어떻게 정규화하는지, metadata 관계와 검색 인덱스, ingestion pipeline, 권한/보존 정책 같은 도메인 동작이 여전히 필요하다. 대신 그 구현은 저장 엔진을 새로 만들 필요 없이 공통 계약을 사용한다.

따라서 모듈과 용어도 PKMS에 묶지 않는 것이 낫다. 예를 들어 `storage-core`, `metadata-store`, `object-store`, `storage-api`, `android-adapter`, `filesystem-adapter`로 나누고, 이후 PKMS와 다른 애플리케이션이 동일 기반을 소비하도록 한다. GitHub adapter는 호환성 검증용/소규모 export backend로 두고, 핵심 object-store 계약은 로컬 filesystem과 A Quantum 복제 backend에서 먼저 검증한다.

## 최종 판단

GitHub repo는 **범용 DB + Object Storage 자체**라기보다 **Git 기반 metadata vault와 암호화된 저빈도 off-device backup**으로 쓰는 것이 맞다. 현재 장비 조건에서는 S21과 A Quantum이 실제 저장 계층/복제본 역할을 맡고, GitHub는 코드·manifest·작은 중요 데이터의 추가 보관층이 된다. 이 범용 저장 계층이 안정화되면 PKMS를 포함한 애플리케이션을 그 위에 구현할 수 있다.

추가로 원본이 거의 전부 텍스트이고, 데이터량이 작고, 초당 쓰기/검색 API가 필요 없다면 GitHub repo를 `GitRepositoryStorage` backend로 실험해 볼 수 있다. 이 경우에도 파일을 append-only immutable object로 배치하고 단일 writer, manifest index, encrypted payload, export/migration, 제한 초과 backoff를 갖춰야 하며, 앱 UI에서 원격 commit 성공을 단일 내구성 보장으로 표현하면 안 된다.
