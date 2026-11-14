# PKMS 클라우드 본문 검색 스펙

이 스펙은 Web, Desktop PKMS, iOS에서 workspace의 Markdown 본문을 검색할 때 사용자에게 보장할 결과와 데이터 경계를 정의한다. 세 클라이언트는 workspace 범위의 공통 검색 API를 사용한다. 현재 사용자 한 명의 workspace를 기준으로 과금 규모를 추정하며, 이는 여러 사용자 확장을 위한 부하 보증이 아니다.

## 목표 결과

- 사용자가 `Cmd+Shift+F`를 누르거나 검색 화면을 열면 workspace 전체 Markdown 본문을 검색할 수 있다. Desktop PKMS에서 검색 input으로 포커스를 이동하고 입력 중 화면을 막지 않는다.
- 검색은 입력 문자열의 literal 부분 문자열을 찾는다. 기본은 대소문자 비구분이며 Match Case를 켜면 구분한다. 정규식, 단어 전체 일치, 파일 일괄 바꾸기는 제공하지 않는다.
- 검색어는 1~200 Unicode code point다. 한 글자·두 글자 검색도 허용하지만 trigram index를 충분히 쓰지 못할 수 있어 DB statement timeout과 결과 제한을 적용한다.
- 입력 후 250ms debounce로 요청하고, 새 입력이 오면 이전 요청을 취소한다. 화면에는 가장 최근 query의 응답만 반영한다.
- 한 페이지에는 최대 100개 파일을 표시하고, 파일마다 최대 10개 일치 줄을 반환한다. 각 미리보기는 최대 240자이며 생략 여부를 알 수 있다. 다음 페이지는 마지막 파일 경로를 cursor로 사용한다.
- 검색 결과는 파일 경로와 일치한 줄을 식별한다. Web/Desktop은 문서를 열고 해당 줄로 이동한다. iOS는 해당 문서를 연다.
- 검색 응답에는 검색 가능한 파일 수, index가 준비된 파일 수, index 대기 중인 파일 수가 포함된다. 대기 파일이 있으면 현재 결과가 일부일 수 있음을 보여주고, 이를 최종 “결과 없음”으로 표시하지 않는다.
- 서버는 검색 결과와 짧은 미리보기만 반환한다. workspace 전체 본문을 클라이언트로 내려보내지 않는다.
- 권한이 없는 workspace는 검색되지 않는다. 검색 API는 인증 및 workspace 접근 권한 확인 후에만 호출된다.

## 검색 범위와 색인

검색 대상은 삭제되지 않은 Markdown 파일 중 크기가 512 KiB 이하인 파일이다. `pkms_files.content`가 현재 `revision`과 일치하는 파일만 검색 가능하다. 본문이 없거나 revision이 오래된 파일은 아직 색인되지 않은 파일로 계산한다. 512 KiB를 넘는 Markdown과 다른 파일 종류는 대상에서 제외한다.

서버는 기존 `pg_trgm` GIN index를 사용해 literal substring 후보를 줄인다. 대소문자 구분 검색은 `LIKE`, 비구분 검색은 `ILIKE`를 사용한다. query의 `%`, `_`, `\`는 wildcard가 아닌 문자 그대로 처리한다. 정규식은 PostgreSQL과 클라이언트 간 문법 차이와 자원 소모를 예측하기 어려워 지원하지 않는다.

색인이 준비되지 않은 동안 검색 결과는 색인된 본문만 포함하고 `pendingFiles`를 표시한다. 서버의 기존 mirror 작업이 본문을 채운 뒤 사용자가 다시 검색하면 진행 상태와 결과를 갱신한다. 오래된 결과를 열 수 없으면 “다시 검색”할 수 있도록 해당 결과가 더 이상 유효하지 않음을 알린다.

## API 결과 계약

PKMS Worker의 `POST /api/workspaces/:workspaceId/search`는 `{ query, caseSensitive, afterPath }`를 받는다. `afterPath`는 다음 페이지를 요청할 때 직전 응답의 `nextPath`를 전달한다. 성공 응답은 다음 형식이다.

```json
{
  "results": [
    {
      "fileId": "file-id",
      "path": "notes/example.md",
      "matches": [
        { "line": 12, "column": 4, "preview": "일치한 내용이 포함된 줄" }
      ]
    }
  ],
  "indexedFiles": 120,
  "searchableFiles": 125,
  "pendingFiles": 5,
  "hasMore": false,
  "nextPath": null
}
```

줄과 열은 1부터 시작한다. 응답에 전체 본문이나 요청 query에 포함되지 않은 파일 내용은 넣지 않는다. query가 유효하지 않으면 400, 검색 저장소를 사용할 수 없으면 본문 내용을 노출하지 않는 503을 반환한다. 결과 파일과 excerpt 수를 제한하고, DB statement timeout을 둔다.

## 사용자 한 명 기준 비용 추정

기존 전체 다운로드 방식은 검색할 때마다 `파일 수 × 평균 파일 크기`만큼 본문을 전송한다. acceptance 자료의 활성 Markdown 3,706개를 기준으로 한 예시이며, 평균 파일 크기는 측정값이 아닌 가정이다.

| 평균 파일 크기 가정 | 전체 본문 1회 전송 | 한 검색 세션에서 query 8회 전송 | 월 10회 세션, query당 전체 scan |
| ---: | ---: | ---: | ---: |
| 5 KB | 18.5 MB | 148 MB | 1.48 GB |
| 10 KB | 37.1 MB | 296 MB | 2.96 GB |
| 20 KB | 74.1 MB | 593 MB | 5.93 GB |

전체 본문을 기기마다 한 번만 내려받는 방식은 10 KB 가정에서 기기당 최초 약 37 MB를 전송한다. 이후에는 cache를 유지해야 하고, 새 기기·cache 삭제·storage eviction 때 다시 전송하며 offline 복제본의 권한과 갱신 수명도 관리해야 한다.

선택한 서버 검색은 요청마다 전체 본문을 보내지 않는다. 응답량은 페이지 수, 매치 줄 수, 미리보기 크기에 따라 늘지만 각 값을 제한한다. 실제 운영 비용은 사용자의 query 수와 결과 크기를 계측해 판단한다. 특정 요금제의 가격을 이 스펙에 고정하지 않는다. 최신 quota와 egress 단가는 [Supabase 사용량 문서](https://supabase.com/docs/guides/platform/manage-your-usage/egress)와 [가격표](https://supabase.com/pricing)에서 확인한다.

## 오류와 오프라인 결과

- 네트워크 오류나 서버 503이면 이전 query 결과를 새 결과처럼 유지하지 않고 재시도할 수 있는 상태를 보여준다.
- 요청 취소는 사용자에게 오류로 표시하지 않는다. 새 query가 시작되면 취소된 요청의 뒤늦은 응답을 버린다.
- iOS에서 연결이 끊기면 workspace 전체 검색을 보장하지 않는다. 현재 기기의 캐시만으로 전체 색인이 만들어져 있다고 가정하지 않는다.
- 권한 오류, 삭제된 파일, stale result는 다른 workspace 자료나 전체 본문을 노출하지 않고 실패를 반환한다.
- index 대기 중과 검색 결과 없음은 서로 다른 상태로 표시한다.

## 확인 항목

비식별 fixture에서 검색 가능한 파일 3,706개, 1·2·3자 query, 한국어와 영어, 대소문자 옵션, `%`·`_`·`\` 문자, 빠른 query 취소, 빈 결과, 여러 페이지, 10개 초과 일치 줄, stale content, 삭제 파일, 다른 workspace 접근 거부를 확인한다. 운영 규모와 비용을 확정할 때는 query 지연시간, DB buffer/CPU, scan·반환 행 수, 응답 크기, Worker 실행 시간과 취소 수를 기록한다.

## 구현 위치와 근거

- Server route와 workspace 권한: [`SupabaseVault.ts`](../../../../apps/pkms-server/src/SupabaseVault.ts), [`pkms_search_content` migration](../../../../apps/pkms-server/supabase/migrations/20261114120000_content_search.sql)
- 기존 본문 mirror와 trigram index: [content mirror migration](../../../../apps/pkms-server/supabase/migrations/20261103100000_content_mirror.sql)
- 공통 PKMS provider와 검색 UI: [`pkmsEditorProvider.ts`](../../../../packages/pkms-client/src/features/editor/pkmsEditorProvider.ts), [`PkmsContentSearchPanel.tsx`](../../../../packages/pkms-client/src/components/PkmsContentSearchPanel.tsx)
- Desktop의 로컬 파일 검색은 서버 검색과 별개로 Main process의 `rg --json` provider를 사용한다: [`localEditorProvider.ts`](../../../../apps/workspace-app/src/renderer/src/editor/localEditorProvider.ts), [`search.ts`](../../../../apps/workspace-app/src/main/search.ts)
- iOS는 같은 검색 API를 호출한다: [`PKMSWorkspaceOperations.swift`](../../../../apps/pkms-ios/PKMSWorkspaceOperations.swift)

PostgreSQL 동작 근거: [`pg_trgm`의 LIKE/ILIKE index 지원과 짧은 pattern 처리](https://www.postgresql.org/docs/current/pgtrgm.html), [GIN 갱신 비용](https://www.postgresql.org/docs/current/gin.html), [정규식 자원 주의](https://www.postgresql.org/docs/current/functions-matching.html). PostgreSQL token full-text search는 substring 검색과 다른 의미를 갖는다. [Supabase 전문 검색 안내](https://supabase.com/docs/guides/database/full-text-search)를 참고한다.
