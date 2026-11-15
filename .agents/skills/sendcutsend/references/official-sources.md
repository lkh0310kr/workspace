# SendCutSend 공식 자료 안내

이 자료들은 안정적인 API가 아니라 최신 근거 자료로 사용하세요. 필드 범위, 값 형식, `N/A` 사용 방식은 달라질 수 있습니다. 통과/실패를 판단할 때는 정확한 출처 URL을 인용하고, JSON 정보라면 사용한 필드 경로도 표시하세요.

## 주요 진입점

- Ordering guide: https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md
- Catalog JSON: https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json
- Engineering specs JSON: https://cdn.sendcutsend.com/specs/sendcutsend-specs.json

검토할 때마다 이 URL에서 자료를 직접 가져오세요. 재료/서비스 확인에는 최신 응답 본문을 근거로 사용하고, 보고서에 URL과 조회 날짜를 적으세요.

## 자료별 역할

- Ordering guide: use for ordering flow, accepted file formats, plain-language design rules, and general service explanations.
- Catalog JSON: use for orderability facts such as material SKUs, material names, thicknesses, stock status, cutting process, min/max part size, available services, hardware items, and finish options.
- Engineering specs JSON: use for SKU-keyed design validation facts such as tolerances, minimum hole/bridge/edge values, bending parameters, tapping, countersinking, hardware insertion, dimple forming, finishing constraints, and material properties.

## 기록할 출처 정보

- Source URL
- Access date
- JSON `_meta.schema_version`
- JSON `_meta.generated_at`
- JSON `_meta.source_data_generated_at` when present
- Field path for row-level citations, such as `sendcutsend-specs.json materials[sku=ALU-063].cutting_specs.min_hole_size`

## 충돌 처리

카탈로그와 사양 자료는 정확한 SKU를 기준으로 연결하세요. 출처 간 내용이 충돌하거나 필드가 누락되거나 파싱할 수 없거나 `N/A`이면, 더 구체적인 출처를 인용해 해결할 수 없는 한 불확실성을 보고하고 관련 행을 `❓ need more info`로 표시하세요.

자료 정보는 다음 우선순위로 사용하세요.

1. material/thickness/service-specific configurator or current quote/upload result
2. exact SKU entry in engineering specs JSON
3. exact SKU entry in catalog JSON
4. ordering guide
5. broader official SendCutSend human-readable page, only when the three source files are insufficient

충돌 내용과 판단에 사용한 페이지를 기록하세요.
