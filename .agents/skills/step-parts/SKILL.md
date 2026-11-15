---
name: step-parts
description: Find, evaluate, and download common purchasable CAD parts from step.parts, including named off-the-shelf actuators, servos, motors, electronics boards, connectors, screws, bolts, nuts, washers, bearings, standoffs, and other catalog components. Use when Codex needs to search the hosted step.parts catalog before creating simplified placeholder geometry, resolve fuzzy part names, standards, aliases, or dimensions, choose a matching part, fetch a canonical .step file, verify checksums, or use the step.parts API/OpenAPI/catalog endpoints for standard part discovery.
---

# CAD 파트

Provenance: maintained in [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad).
실행 시에는 설치된 로컬 스킬 파일을 기준으로 사용하세요. 저장소 링크는 출처 확인과 릴리스 검토용입니다.

## 개요

HTML을 스크래핑하거나 로컬 저장소 파일에 의존하지 말고 호스팅된 step.parts 기계용 엔드포인트를 사용하세요. 사용자가 다른 호스팅 미러를 제공하지 않는 한 `https://api.step.parts`를 표준 API 주소로, `https://www.step.parts`를 사이트/정적 자산 주소로 취급하세요. 네트워크/DNS 오류만으로는 결론을 내릴 수 없습니다. 샌드박스에서 `api.step.parts`에 연결할 수 없으면 결과가 없다고 보고하거나 대체 형상을 사용하기 전에 네트워크 권한으로 한 번 재시도하세요. API에 연결해 관련 후보가 없음을 확인하지 않았다면 부품을 사용할 수 없다고 설명하지 마세요.

CAD 어셈블리에 이름이 지정된 기성 액추에이터, 서보, 모터, 전자 보드, 커넥터 또는 구매 가능한 다른 부품이 포함되면 단순 대체 형상을 만들기 전에 step.parts를 검색하세요. 이름이 지정된 서보, 모터, 액추에이터는 포기하기 전에 정확한 모델명과 흔한 별칭 및 제조사 표기를 모두 검색하세요. 예를 들어 `STS3215`는 `ST3215`, `3215`, `Waveshare Feetech ST3215` 또는 `family=feetech`로 등록되어 있을 수 있습니다. API에 연결했고 정확하거나 거의 일치하는 항목을 찾지 못했다면 검색 실패를 기록한 뒤, 문서화된 외형 치수 또는 단순 대체 형상을 사용하세요.

## 빠른 작업 흐름

1. 요청된 부품을 검색어와 선택적 패싯으로 변환합니다.
   - `q` for fuzzy tokens, standards, aliases, dimensions, source/product URLs, and attribute names/values.
   - `category`, `family`, `standard`, or `tag` when the user gives an exact facet.
2. `/v1/parts`를 검색하고 `items`, `total`, `facets`를 확인합니다. 액추에이터 모델 번호는 결과가 없다고 판단하기 전에 가능한 별칭, 생략된 문자, 제조사 이름, 관련 패밀리 패싯으로 재검색합니다.
3. 결과가 모호하면 선택하기 전에 `id`, `name`, `standard`, 주요 속성을 포함한 최선의 후보 몇 개를 제시합니다. 명확히 일치하는 결과가 하나 있으면 사용자가 로컬 STEP 파일을 요청하지 않는 한 다운로드하지 않고 선택한 레코드 세부 정보를 반환합니다.
4. 기성 액추에이터의 정확하거나 거의 일치하는 모델을 찾으면 조립 단계에서 단순 외형을 사용할 명확한 이유가 없는 한 STEP 파일을 내려받아 사용합니다. 선택 이유를 명시적으로 기록합니다.
5. 사용자가 STEP 파일 다운로드 또는 저장을 요청하면 `stepUrl`에서 파일을 내려받고, 레코드에 `sha256`이 있으면 파일을 검증합니다.
6. 파일을 내려받았다면 로컬 경로와 선택한 부품 ID, 출처를 추적할 수 있는 페이지/API URL을 반환합니다.

## CAD Viewer 전달

After completing step.parts work that creates or updates a local `.step` or `.stp` file, you must ALWAYS hand the explicit file path to `$cad-viewer` when that skill is installed. `$cad-viewer` must start CAD Viewer if it is not already running and return link(s) to the relevant created or updated file(s); if `$cad-viewer` is unavailable or startup fails, report that instead of silently omitting the handoff.

## 포함된 다운로드 도구

Use `scripts/download_step_part.py` for deterministic search, download, and checksum verification:

```bash
python scripts/download_step_part.py "M3 socket head 12" --download
python scripts/download_step_part.py --id iso4762_socket_head_cap_screw_m3x12 --download
python scripts/download_step_part.py "bearing 608zz" --limit 5
```

주요 옵션:

- `--origin`: override `https://api.step.parts` only when the user provides another hosted API origin.
- `--tag`, `--category`, `--family`, `--standard`: repeatable facet filters.
- `--out-dir`: override the download directory when the user asks for a specific destination.
- `--all`: with `--download`, download every result on the returned page as individual STEP downloads.
- `--overwrite`: replace an existing output file.

스크립트는 stdout에 JSON을 출력합니다. 검색 시 일치한 레코드를 출력하고, 다운로드 시 저장된 파일 경로, 체크섬, 출처 URL을 출력합니다.

## API 참고 자료

엔드포인트 세부 정보, 필드 의미 또는 쿼리 동작을 확인해야 할 때는 `references/step-parts-api.md`를 읽으세요. 다음 항목을 우선 사용합니다.

- `/v1/parts` for filtered search with absolute asset URLs.
- `/v1/parts/{id}` for one enriched record.
- Returned `stepUrl` for STEP downloads.
- `/v1/catalog/parts.index.json` for a compact discovery index.
- `/v1/catalog/schema` for field and family attribute meanings.
- `/v1/openapi.json` when generating a client or tool.

## 검색 지침

- API는 쿼리 토큰을 AND로 결합하므로 구체적으로 시작하되 지나치게 제한하지 마세요. 예를 들어 정확한 패밀리 및 표준 필터를 추가하기 전에 `M3 SHCS 12`를 사용합니다.
- 하나의 패싯 안에 있는 값들은 OR로 결합되고, 선택한 `tag`, `category`, `family`, `standard` 필드는 서로 AND로 결합됩니다. 알려진 범주 안에서 정확한 패싯으로 범위를 좁힌 다음 이름과 속성으로 직접 순위를 정하세요.
- 표준은 `ISO 4762`, `ISO4762` 또는 정확한 `standard.designation`으로 검색할 수 있습니다.
- `attributes` 객체에는 `thread`, `lengthMm`, `bore1Mm`, `material`, `profileSeries`, `slotSizeMm` 및 밀리미터 단위 치수와 같은 패밀리별 정보가 들어 있습니다.
- 부품, GLB, PNG URL 형식은 `https://www.step.parts`에서 예측할 수 있습니다. STEP URL은 환경에 따라 달라지며 운영 환경에서는 GitHub LFS 미디어로 연결될 수 있습니다. 다운로드에는 카탈로그/API가 반환한 `stepUrl`을 사용하세요.
