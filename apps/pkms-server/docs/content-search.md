# PKMS Cloud 본문 검색: 가능성·비용 검토

이 문서는 Web/Desktop PKMS/iOS에서 workspace 전체 Markdown 본문을 검색할 때의 현재 경계와 비용을 기록한다. 실제 workspace 내용을 내려받거나 운영 DB를 조회하지 않았다. 크기 추정은 acceptance 문서에 기록된 활성 Markdown 3,706개를 기준으로 한 시나리오이며 평균 파일 크기는 가정값이다.

## 결론

- Web과 iOS의 전체 본문 검색은 가능하다. 각 기기로 전체 note body를 복사하지 않고 PKMS API가 검색 결과와 짧은 문맥만 반환하도록 구현한다.
- 현재 서버의 `pkms_files.content`에는 `pg_trgm` GIN 인덱스가 이미 있다. 이 인덱스는 literal substring `LIKE`/`ILIKE` 검색을 지원하므로 첫 구현은 이 인덱스를 재사용하는 것이 가장 작은 변경이다. 별도 검색 서비스나 모든 본문의 기기별 복제는 현재 규모에 필요하지 않다.
- 최소 3자 이상이며 추출 가능한 trigram이 있는 literal query만 기본 검색으로 받는다. 추출 가능한 trigram이 없는 검색 pattern은 PostgreSQL이 전체 index scan으로 처리할 수 있다. 1–2자 검색과 trigram을 추출하지 못하는 regex는 넓은 scan을 유발할 수 있으므로 기본 요청으로 허용하지 않는다.
- `Cmd+Shift+F` UI는 provider의 `searchContents` capability를 열고, server query는 취소 가능·debounce·결과 제한으로 실행한다. Mobile은 같은 API를 검색 UI에서 호출할 수 있다. Offline mobile은 현재 기기에 cache된 최근 20개 문서만 검색할 수 있고 workspace 전체 검색을 보장하지 않는다.

## 현재 구조와 제한

- 일반 Desktop Workspace의 local filesystem provider는 Electron Main에서 `rg --json`을 실행한다. 파일별 결과를 stream하고 cancel할 수 있어 renderer가 본문 전체를 순회하지 않는다.
- PKMS `EditorProvider`는 `searchNames: true`, `searchContents: false`다. 현재 provider의 `search`는 이름만 처리한다. Desktop PKMS가 folder sync로 local root를 연결해도 이 provider가 ripgrep 경로로 전환되지는 않는다. Web·cloud-only Desktop·iOS에도 전체 본문 검색 기능이 없다.
- Server는 `/snapshot`과 `/sync/tree`에서 파일 metadata를 1,000개 단위로 반환하고 `/sync/download`는 한 번에 최대 32개 본문을 돌려준다. 검색 query endpoint는 없다. 이 API로 전체 문서를 반복 다운로드해 브라우저에서 매 query scan하면 요청 수와 egress가 입력 글자 수에 비례한다.
- iOS 앱은 workspace metadata를 내려받고 최근 20개 Markdown 문서의 CRDT state만 local cache에 유지한다. 전체 본문 index는 없다.
- `pkms_files.content`는 Yjs document의 revision-guarded mirror다. `pkms_files_content_trgm` GIN index가 `kind='markdown'`, active, non-null content row에 존재하고 link maintenance의 substring lookup에서 사용된다. 하지만 검색 API에 사용되지는 않는다.

## 검색 구현 선택

### 1. 서버 검색: 권장

**결정:** PKMS 전체 본문 검색은 PostgreSQL `pkms_files.content`의 기존 trigram GIN index를 통해 서버에서 수행한다. Web, Desktop PKMS, iOS는 같은 workspace-scoped API를 사용한다. 각 클라이언트가 전체 workspace 본문을 내려받아 검색하지 않는다. Elasticsearch 등 별도 검색 시스템과 workspace 전체의 기기별 index는 현재 규모에 도입하지 않는다.

검색은 사용자가 입력한 문자열 그대로 찾는 literal substring 검색이다. 기본은 대소문자 비구분이며 Match Case를 선택하면 대소문자를 구분한다. 정규식, whole-word, replace-in-files는 이번 결과 계약에 포함하지 않는다. 이는 검색어 입력·결과 탐색을 빠르고 예측 가능하게 제공하고, PostgreSQL POSIX regex와 클라이언트 regex의 의미 차이를 피하기 위함이다.

검색어는 1–200 Unicode code point까지 허용한다. 3자 미만 검색은 trigram index를 충분히 활용하지 못해 DB가 작은 workspace corpus를 직접 확인할 수 있으므로, DB statement timeout과 결과 제한을 적용한다. 3자 이상 literal 검색은 기존 trigram GIN index가 후보 문서를 좁힌다. 결과는 파일당 최대 10개 일치 줄, 페이지당 최대 100개 파일로 제한하며 각 미리보기 줄은 최대 240 code point와 생략 표시다. 페이지는 마지막 경로 cursor로 이어서 가져온다. 클라이언트는 250ms debounce 후 이전 요청을 abort하고 최신 쿼리 결과만 표시한다.

검색 API는 매치 결과와 함께 `indexedFiles`, `searchableFiles`, `pendingFiles`를 반환한다. 활성 Markdown 중 indexable 크기(최대 512 KiB)인 파일 가운데 `content_revision = revision`인 파일만 검색 가능하다. `pendingFiles > 0`이면 검색 UI는 현재 결과가 부분적임을 표시한다. 기존 1분 주기의 mirror 작업이 콘텐츠를 채우며, 다음 검색 요청에서 진행 상태가 갱신된다. 매치가 0개일 때도 index가 진행 중이면 “결과 없음”으로 단정하지 않는다.

매치는 line 단위이며 결과 선택 시 그 파일을 열고 해당 line으로 이동한다. 문서가 rename/delete된 경우 stale result를 열 수 없음을 처리하고 결과를 새로 검색한다. 서버는 현재 로그인 사용자의 workspace를 먼저 확인하고 DB 함수에도 workspace ID를 전달한다. DB 함수는 활성 Markdown, revision-matched content만 대상으로 하며 전체 본문을 반환하지 않는다.

Worker route가 로그인 사용자와 workspace 접근 권한을 먼저 확인한 뒤 제한된 검색 RPC를 호출한다. DB는 활성 Markdown의 `content`에 trigram 조건을 적용하고, 제한된 결과에 대해서만 본문에서 일치 줄·column·preview를 만든다. Client는 `{path, fileId, line, column, preview, ranges}`를 받고 결과를 표시한다. 본문 전체는 기기에 보내지 않는다.

현재 GIN index를 재사용하면 새 index의 저장 공간과 write amplification은 발생하지 않는다. 비용은 query에 따른 DB CPU/IO와 결과 egress다. index 후보가 작고 반환 행 수를 제한하면 요청 비용은 query와 결과 크기에 따라 증가하며 전체 corpus 크기만큼 응답하지 않는다. 실제 latency/CPU는 운영 workspace에서 `EXPLAIN (ANALYZE, BUFFERS)`를 실행하거나 비식별 fixture로 측정하기 전에는 확정하지 않는다.

Case sensitive는 `LIKE`, insensitive는 `ILIKE`를 사용한다. PostgreSQL POSIX regex와 JavaScript regex는 같은 문법이 아니며, 임의 regex는 pathological pattern으로 DB 시간·메모리를 소모할 수 있어 cloud search에서 제공하지 않는다. 검색 결과를 `Replace in files`로 바로 치환하는 기능도 이 스펙 범위 밖이다.

### 2. 기기 전체 index: 초기 구현에서 제외

전체 body를 첫 검색 때 한 번 내려받아 IndexedDB/iOS 파일에 색인하면 같은 기기에서 이후 typing 비용은 거의 사라지고 offline 검색도 가능하다. 그러나 매 device/workspace마다 corpus 복제본과 index를 저장하고, 이후 수정·삭제를 cursor와 맞춰 반영해야 한다. Browser storage eviction, iOS cache 제한, 새 기기 재인덱스와 권한 철회 시 정리도 추가된다. 현재 iOS의 20-note cache를 workspace-wide index로 바꾸는 제품 선택이 필요하다.

Desktop local folder가 연결된 경우에는 이 복제 경로 대신 이미 있는 local ripgrep 경로를 사용할 수 있다. Cloud-only Desktop은 Web과 같은 server search를 사용한다.

### 3. PostgreSQL token full-text index: 별도 검색 모드

`tsvector` GIN은 단어·어근·phrase 및 relevance 검색에 맞는다. 입력 부분 문자열을 찾는 VS Code/Obsidian식 Find-in-Files substring semantics와 동일하지 않다. 토큰화, stemming, Korean word behavior가 달라지므로 literal text search의 대체재로 사용하지 않는다. 향후 `Search by terms`라는 별도 제품 결과가 필요할 때 검토한다.

## 전송량·egress 시나리오

산식은 `3,706 files × 평균 body bytes × 전체 corpus scan 횟수`다. 아래 값은 JSON/HTTP overhead를 제외한 uncompressed corpus 전송량이다. 압축률은 문서 구성과 transport에 따라 달라지므로 비용 절감에 미리 반영하지 않았다.

| 가정한 평균 Markdown 크기 | corpus 1회 전송 | debounce 후 query 8회 전송 | 사용자 1,000명이 한 번씩 검색 |
| ------------------------ | ---------------: | -------------------------: | --------------------------: |
| 5 KB                     | 18.5 MB          | 148 MB                     | 148 GB                      |
| 10 KB                    | 37.1 MB          | 296 MB                     | 296 GB                      |
| 20 KB                    | 74.1 MB          | 593 MB                     | 593 GB                      |

사용자 1,000명이 한 달에 각각 10번 검색하고 매 query마다 전체 corpus를 새로 받는 경우, 10 KB 가정은 약 2.96 TB/month다. Supabase Pro/Team 공개 요금은 월 250 GB egress 포함, 이후 uncached egress $0.09/GB이므로 이 검색만의 초과분은 약 $244/month다. 5 KB 가정은 약 1.48 TB, 초과분 약 $111/month이며, 20 KB 가정은 약 5.93 TB, 초과분 약 $511/month다. 이는 전체 egress quota를 다른 서비스가 전혀 사용하지 않는다고 가정한 대략치다.

전체 corpus를 기기마다 한 번만 받아 영구 cache한다면 10 KB 가정에서 사용자 1,000명은 약 37 GB의 최초 egress다. 대신 각 사용자/device의 저장소에 최소 37 MB plus index가 필요하며 cache eviction이나 두 번째 device는 다시 전송한다. 전체 scan 방식은 debounce를 여러 번 통과하는 typing query에서 같은 본문을 중복 전송할 위험이 있어 권장하지 않는다.

서버 검색은 page당 최대 100개 결과와 line preview를 반환하는 식으로 제한할 수 있다. 예를 들어 응답이 query당 100 KB를 넘지 않도록 하면 같은 사용자 모델(1,000명 × 10회 × 8 query)에서 최대 약 8 GB egress다. 이 값은 설계 목표 예시이며 실제 결과 수·preview 길이를 측정해 limit을 정한다.

가격 근거: [Supabase egress 요금·quota](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Supabase 가격표](https://supabase.com/pricing).

## 운영 안전 조건과 측정 항목

- Server가 검색 가능한 corpus 범위를 보장한다. `content_revision = revision`인 active Markdown만 결과에 포함하고, stale/null mirror를 조용히 빠뜨리지 않도록 배포 전 completeness를 집계한다. 누락이 있으면 문서를 재구성하거나 해당 결과를 검색 미완료 상태로 반환한다.
- `query` 길이, option, result count, preview bytes를 검증하고 workspace filter를 SQL 함수 내부에서 적용한다. Query 제한/취소, DB statement timeout, per-user rate limit, 결과 cap을 둔다. Cloudflare 요청 취소가 이미 실행 중인 DB statement를 항상 중단한다고 가정하지 않는다.
- 각 입력 변경은 이전 AbortSignal/request ID를 취소하고 짧은 debounce를 적용한다. 첫 query는 입력 후 focus/typing을 막지 않고 결과를 점진적으로 표시한다. Search UI는 provider가 contents search를 지원하는지 보고만 활성화한다.
- Cloud response는 문서 본문 전체를 반환하지 않고 매치 줄의 제한된 excerpt만 반환한다. 결과 선택 시 기존 PKMS open-document route로 해당 문서를 연다.
- Load test는 실제 문서 내용을 사용하지 않는 비식별 fixture로 수행한다. 최소한 3,706개 행, 작은/중간/큰 body 분포, 빈 결과·다수 결과, 한국어/영어, 빠른 query 취소, stale content, 권한 분리, short query reject, regex reject를 포함한다.
- 측정: query p50/p95 latency, `EXPLAIN` index/heap buffers, rows scanned/returned, CPU time, DB egress bytes, Worker duration/invocations, cancelled request count, response bytes, stale-content exclusions. 이 값이 있어야 운영 비용을 확정할 수 있다.

## 근거 코드

- [Desktop local ripgrep provider](../../workspace-app/src/renderer/src/editor/localEditorProvider.ts)
- [Desktop ripgrep process](../../workspace-app/src/main/search.ts)
- [PKMS provider capability](../../../packages/pkms-client/src/features/editor/pkmsEditorProvider.ts)
- [PKMS server routes and document batch API](../src/SupabaseVault.ts)
- [Existing trigram content index](../supabase/migrations/20261103100000_content_mirror.sql)
- [iOS current document cache](../../pkms-ios/PKMSModel.swift)

PostgreSQL behavior: [`pg_trgm` indexed `LIKE`/`ILIKE`/regex and full-index fallback](https://www.postgresql.org/docs/current/pgtrgm.html), [GIN write/update cost](https://www.postgresql.org/docs/current/gin.html), [regex resource caution](https://www.postgresql.org/docs/current/functions-matching.html). Supabase full-text search documents tokenized `tsvector` semantics and GIN indexing at [Full Text Search](https://supabase.com/docs/guides/database/full-text-search).
