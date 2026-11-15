# SendCutSend 검증 보고서 템플릿

사용자가 검토, 검증, 사전 점검 또는 제조 준비 상태 보고서를 요청하면 이 구조를 사용하세요.

## 맥락

- File: `<path>`
- Assumed service: `DXF laser sheet cutting` or `STEP CNC routing`
- Order context: material, thickness, primary process, finish, quantity, secondary operations
- Date checked: `<YYYY-MM-DD>`

## 확인한 자료

검사에 사용한 SendCutSend 공식 URL을 Markdown 링크로 나열하세요. 실제 확인한 자료만 포함합니다. 조회 날짜와 JSON `_meta.generated_at` 값이 있으면 함께 적으세요. 발견 사항 표에도 각 행의 구체적인 규칙 출처 링크를 넣어야 합니다. 따라서 이 절은 참고 문헌이며 행별 인용을 대신하지 않습니다.

## 형상 정보

가능하면 `$cad` 검사 및 필요한 부분만 확인하는 `build123d`/`ezdxf` 검사 코드에서 얻은 파일 형식, 단위, 범위/경계 상자, 엔티티/바디 수, 레이어, 지원하지 않는 엔티티, 눈에 띄는 열린/중복 형상, 파싱 제한 사항을 요약하세요.

검토 대상 업로드 파일을 이 작업 흐름에서 생성하거나 수정했다면 `$cad-viewer` 링크를 사용할 수 있는 경우 포함하세요.

For bent 2D files, include bend geometry facts from the exported file: bend-line count and layers, individual bend line lengths, nearest non-bend cut geometry for each bend line, local flange depths, bend-line span coverage, bend-adjacent cut geometry, insufficient contact/support observations, and any split/interrupted/common-axis bend observations. Use those facts for comparison against the current material/thickness service page.

For bent STEP/STP files, include measured sheet thickness when available and the extracted bend-radius set. Compare bend radii to the selected material/SKU only when that order context is known.

## 발견 사항

문제마다 한 행을 사용하세요. `Rule source`에는 확인 중인 요구 사항을 정의하는 공식 페이지 또는 JSON 파일을 연결하고, JSON 출처라면 필드 경로를 포함하세요. 예: `[sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) materials[sku=ALU-063].cutting_specs.min_hole_size`. 일반 가이드 문구보다 정확한 SKU별 출처를 우선하세요. 외부 규칙이 적용되지 않으면 `Direct file inspection`이라고 적으세요.

| Status | Check | Evidence | Rule source | Recommendation |
| --- | --- | --- | --- | --- |
| ✅ pass / ❌ fail / ❓ need more info | requirement name | file fact | Markdown link to specific rule doc/table, or `Direct file inspection` | concrete next action |

## 판정

다음 중 하나로 판정하세요.

- `Ready to upload for this assumed context`
- `Needs edits before upload`
- `Insufficient context to validate`

필수 최신 공식 요구 사항 중 하나라도 `❌ fail` 또는 `❓ need more info`이면 업로드 준비 판정을 내리지 마세요. 모든 필수 인용 항목에 주문 맥락, 출처 근거, 측정된 파일 정보가 충분하고 통과했거나 선택한 서비스 범위 밖이라고 명시한 경우에만 `Ready to upload for this assumed context`를 사용하세요. SendCutSend UI 분류 모델을 명시적으로 도입하기 전까지는 측정된 업로드 위험 및 제조 가능성 문제를 `❌ fail`로 취급하세요.
