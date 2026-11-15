# step.parts API 참고 자료

## 주소

기본 API 주소는 `https://api.step.parts`입니다. 사용자가 다른 step.parts 호환 호스팅 API 도메인을 제공하는 경우에만 다른 주소를 사용하세요. 정적 HTML 페이지는 `https://www.step.parts`에 있고 API 레코드의 GLB 및 PNG 미리보기 URL은 Vercel Blob을 직접 가리킵니다. STEP URL은 환경에 따라 달라지며 운영 레코드는 커밋이 고정된 GitHub LFS 미디어를 사용합니다. API 도메인이 확인되지 않으면 호스팅 서비스를 사용할 수 없는 것으로 취급하고, 실시간 다운로드가 필요할 때는 배포된 주소를 요청하세요.

## 기계용 엔드포인트

| 엔드포인트 | 용도 |
| --- | --- |
| `https://www.step.parts/llms.txt` | 엔드포인트 요약 및 예제가 포함된 사람이 읽을 수 있는 에이전트 가이드. |
| `/v1/parts` | 검색, 필터링, 페이지 분할 및 절대 자산 URL 조회. |
| `/v1/parts/{id}` | 안정적인 ID로 상세 부품 레코드 하나를 가져옵니다. |
| `/v1/catalog/schema` | JSON Schema, 필드 의미, 결과 정렬 및 패밀리별 속성 설명. |
| `/v1/catalog/parts.index.json` | 상세 정보 조회 전에 빠르게 검색할 수 있는 간결한 ID/이름/패싯 탐색 인덱스. |
| `/v1/openapi.json` | 클라이언트/도구 생성을 위한 OpenAPI 3.1 계약. |

## `/v1/parts` 쿼리 매개변수

- `q`: ID, 이름, 설명, 범주, 패밀리, stepSource, productPage, 태그, 별칭, 표준 필드, 속성 키 및 값에서 토큰화 검색합니다. 모든 토큰이 일치해야 합니다.
- `tag`, `category`, `family`, `standard`: 반복해서 지정할 수 있는 필터입니다. 쉼표로 여러 값을 지정할 수도 있습니다. 한 패싯 내 값은 OR로 결합되고, 선택한 패싯 필드는 서로 AND로 결합됩니다.
- `page`: 1부터 시작하는 페이지 번호.
- `pageSize`: 기본값 `100`, 최댓값 `500`.

필터가 없는 결과는 고정된 100개 부품 모음으로 시작하며 이후 안정적인 원본 카탈로그 순서로 이어집니다. 필터링된 결과도 안정적인 원본 카탈로그 순서로 정렬됩니다.

Examples:

```text
https://api.step.parts/v1/parts?q=M3&tag=screw&page=2
https://api.step.parts/v1/parts?pageSize=100
https://api.step.parts/v1/parts?category=fastener&family=socket-head-cap-screw&standard=ISO%204762
https://api.step.parts/v1/parts?q=lengthMm%2012
```

## 응답 필드

`/v1/parts`는 다음을 반환합니다.

- `catalog`: 부품 수, 최종 수정 시각, 카탈로그 체크섬, schema/OpenAPI URL.
- `items`: 절대 `pageUrl`, `apiUrl`, `stepUrl`, `glbUrl`, `pngUrl`이 포함된 상세 부품 레코드.
- `page`, `pageSize`, `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`.
- `facets`: available `tags`, `categories`, `families`, and `standards` with counts.
- `filters`: parsed active filters.

각 부품 레코드에는 다음이 포함됩니다.

- `id`: 안정적인 snake_case 식별자이자 자산 파일명 기본값.
- `name`, `description`, `category`, `family`, `tags`, `aliases`.
- `standard`: 선택적 `{ body, number, designation }` 값.
- `attributes`: 패밀리별 스칼라 정보.
- `stepUrl`, `glbUrl`, `pngUrl`.
- `byteSize`, `sha256`.

## 자산 URL 형식

가능하면 응답에 포함된 URL을 사용하세요. 형식은 다음과 같습니다.

```text
https://www.step.parts/step/{id}.step
API 레코드가 반환한 절대 `glbUrl` 및 `pngUrl`을 사용하세요. 미리보기 자산은 Vercel Blob에서 제공합니다.
https://www.step.parts/parts/{id}
```

`/step/{id}.step` 경로는 로컬/개발 모드에서 체크아웃된 STEP 데이터를 제공하고 운영 환경에서는 커밋이 고정된 GitHub LFS 미디어로 리디렉션합니다.

## 다운로드 및 검증

STEP 파일을 다운로드할 때는 다음 절차를 따르세요.

1. `/v1/parts` 또는 `/v1/parts/{id}`에서 부품 레코드를 가져옵니다.
2. `stepUrl`에서 파일을 다운로드합니다.
3. 레코드의 `sha256`이 null이 아니면 파일의 SHA-256과 비교합니다.
4. 사용자가 달리 요청하지 않는 한 원래 `.step` 확장자를 유지하고 파일명에 출처 ID를 보존합니다.
