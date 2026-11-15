---
name: sendcutsend
description: Review DXF and STEP/STP uploads for SendCutSend.com orders using its ordering guide, catalog, and specs. Use only for SendCutSend.com preflight reports covering upload readiness, selected material/SKU/thickness/service availability, and service-specific checks for laser cutting, CNC routing, bending, tapping, countersinking, hardware insertion, and finishing.
---

# SendCutSend 사전 검토

Provenance: maintained in [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad).
실행 시에는 설치된 로컬 스킬 파일을 기준으로 사용하세요. 저장소 링크는 출처 확인과 릴리스 검토용입니다.

DXF 및 STEP/STP 파일에 대해 근거를 바탕으로 보수적인 SendCutSend 사전 검토 보고서를 작성할 때 이 스킬을 사용하세요.

SendCutSend 주문 가이드, 카탈로그 JSON, 사양 JSON은 안정적인 API가 아니라 근거 자료로 취급하세요. 필드 이름, 형식, 범위는 달라질 수 있습니다. 누락되거나 파싱할 수 없는 값, `N/A`, 서로 충돌하는 자료를 통과 또는 실패로 판단하지 마세요. 공식 URL에서 자료를 직접 가져오고, 로컬 검사 코드는 파일의 구체적인 사실을 측정하는 데만 사용하세요. 최종 보고서는 명시적인 비교 결과를 바탕으로 작성하세요.

## 형상 검사

로컬 형상 검사 코드는 현재 프로젝트의 Python 환경에서 실행하세요. `$cad` 스킬을 사용할 수 있으면 STEP/STP/DXF 형상 검사, 측정, 검증에 먼저 사용한 다음 SendCutSend에 필요한 측정값 중 빠진 항목을 추가로 구하세요. STEP/STP 검사에는 `build123d.import_step`을 사용하고, 형상 정보가 필요한 DXF 검사에는 `ezdxf` 패키지를 직접 사용하세요 (`import ezdxf`; build123d와 함께 설치됩니다). `build123d.ezdxf`는 없습니다. 형상 정보 확인에 원문 텍스트 파싱이나 다른 형상 백엔드를 사용하지 마세요.

## CAD Viewer 전달

After completing SendCutSend work that creates or modifies a `.dxf`, `.step`, or `.stp` upload candidate, you must ALWAYS hand the explicit file path(s) to `$cad-viewer` when that skill is installed. `$cad-viewer` must start CAD Viewer if it is not already running and return link(s) to the relevant created or updated file(s); if `$cad-viewer` is unavailable or startup fails, report that instead of silently omitting the handoff.

## 공식 자료

검토를 시작할 때마다 `references/official-sources.md`에 나열된 공식 URL에서 최신 SendCutSend 자료를 직접 가져와 확인하세요.

필요하면 출처 목록에 자료 URL, 조회 날짜, JSON `_meta` 값을 기록하세요. 자료를 가져올 수 없다면 최신 SendCutSend 자료를 확인할 수 없었다고 보고하고, 해당 자료에 의존하는 항목에 업로드 가능 판정을 내리지 마세요.

## 작업 흐름

1. 주문 의도를 확인합니다.
   - 레이저 판재 절단 및 2D 판재 윤곽에는 DXF를 우선 사용합니다.
   - CNC 라우팅 및 3D 모델 업로드에는 STEP/STP를 우선 사용합니다.
   - 파일 형식, 의도한 공정, 재료/SKU, 두께, 수량, 서비스, 마감, 하드웨어를 기록합니다.
   - 주문 정보가 없거나 모호하면 구체적인 선택지를 제시할 만큼 자료를 조사한 뒤, 준비 상태를 판정하기 전에 사용자 확인을 받습니다. 후보 SKU/재료/두께/서비스와 관련 출처 링크를 포함하고, 사양 JSON에 있으면 `photo_url` 이미지와 `learn_more_url` 링크도 포함합니다.
2. `references/official-sources.md`를 읽고 공식 자료를 직접 가져와 확인합니다. 숫자 문자열, 크기 문자열, `N/A`, 누락 필드, 혼합 형식, 누락된 서비스 배열은 명시적인 메모로 남깁니다.
3. 가능하면 `$cad`를 사용해 실제 업로드 파일을 검사하고, 누락된 사실은 Python/`build123d`로 필요한 부분만 측정합니다. 원본 생성기, CAD 모델 또는 생성기 콘솔 요약만 검사하지 마세요.
   - DXF: measure units, bounds, layers, entity types, open/duplicate geometry, unsupported annotations, candidate holes/circles, linework stats, bend-line candidates, bend-to-cut distances, bend-adjacent cut geometry, local flange depths, and degenerate zero-area contours as needed for the selected service.
   - STEP/STP: measure parseability, units hints, solid/surface signals, bounding box, shell/body signals, validity, sheet thickness where available, cylindrical bend-face radii where bending is in scope, and limitations as needed for the selected service.
   - 검사 보조 도구는 사실만 출력해야 합니다. 측정값, 파싱 오류, 제한 사항은 보고할 수 있지만 통과/실패/준비 상태를 판정해서는 안 됩니다.
4. 근거의 신뢰도에 따라 출처 레코드를 선택합니다.
   - Use exact SKU as the only authoritative catalog/spec join.
   - If only material and thickness are provided, use a selected material only when the candidate match is unique and exact enough; otherwise list candidates with links/images from the source records and ask the user to choose.
   - Use the catalog JSON for orderability: stock, cutting process, available services, size limits, hardware, and finishes.
   - Use the specs JSON for engineering values: tolerances, holes, bridges, bending, tapping, countersinking, hardware insertion, finishing, and material properties.
   - Use the ordering guide for plain-language workflow and general file-format rules.

## 비교

신뢰할 수 있는 근거 쌍만 비교하세요.

- Determine whether a check applies.
- Cite the source field path or guide section.
- Cite the measured file fact.
- Compare only when both the source requirement and measured file fact are available and trustworthy.
- If a needed measurement is missing or risky, write a small targeted `build123d`/`ezdxf` inspector for that specific geometry fact.
- Treat every measured upload risk, manufacturability issue, or cited requirement violation as an error for now. Do not infer any alternate SendCutSend UI classification.
- For DXF units, inspect `$INSUNITS`, header extents, measured bounds, and order context together. If `$INSUNITS` is missing, unsupported, or not one of the SendCutSend guide's expected DXF unit codes (`1` inches or `4` mm), report a unit/scale error and recommend re-exporting or confirming units before applying size-, flange-, or material-specific comparisons. Do not silently rescale geometry or use an uncertain scale to issue material-specific pass/fail checks.
- For 2D files with bend lines, check flange length locally along every bend line. Measure the nearest cut/free edge on both sides of each bend at each span or sample point, including notches, slots, gaps, split tabs, and cutouts that interrupt the bend span or create a local free edge. Compare the minimum local flange depth to the selected SKU's `bending_specs.min_flange_length_before_bend` and `bending_specs.min_flange_length_after_bend`. Do not apply flange-length limits to ordinary enclosed holes or interior cutouts unless a cited source gives a hole-to-bend or feature-to-bend rule for that service; report those separately with centerline-to-bend or edge-to-bend measurements as the cited rule requires. Do not treat nearby bend-adjacent cut geometry as only corner relief unless the remaining local flange still passes the flange-length minimum. If any local flange depth is below the SKU minimum, report `❌ fail`. Do not rely on aggregate source-level values when exported geometry has local cutouts, interrupted bends, split bend segments, reliefs, tabs, or unsupported regions.
- Keep bend findings separate by physical cause. Do not collapse bend-adjacent geometry into a generic flange failure. Report distinct rows for minimum flange/contact length errors, bend line or die-area geometry crossings, insufficient bend contact/support from nearby free edges or cutouts, bend lines that do not span the bent region, split/common-axis bend segments, and cut geometry touching or crossing bend lines. If a SendCutSend source does not expose the exact die-area/contact threshold, cite the measured file fact as direct file inspection and mark the source-limited comparison explicitly.
- For STEP/STP bent parts, inspect bend radii when the model contains sheet-metal bend geometry or the intended service includes bending. Extract cylindrical or toroidal bend faces and their radii with `$cad`/`build123d`/OCP where possible, group repeated bend radii, and compare them to the selected SKU's `bending_specs.effective_bend_radius` or `bending_specs.bend_radius`. If the selected material/SKU is unknown, report the measured bend-radius set and ask for material/thickness before readiness verdicts. If measured radii conflict with the selected SKU tooling radius, report a bend-radius mismatch error.

판정 라벨은 신중하게 사용하세요.

- `✅ pass`: the measured file fact satisfies the cited current requirement.
- `❌ fail`: a measured upload risk, manufacturability issue, or direct measured violation of a cited current requirement.
- `❓ need more info`: missing context, missing source evidence, unmeasured geometry, source conflicts, or tool limitations.

## 진단 이미지

시각 자료로 더 쉽게 설명할 수 있는 발견 사항이 있으면 이미지 생성 또는 편집 기능을 사용할 수 있을 때 간결한 진단 도해를 먼저 작성하세요. 생성하거나 편집한 이미지에 주석, 범례, 수정 전후 설명을 넣으세요. `❌ fail`, 위치가 모호한 형상 문제, 수정 전후 설명이 필요한 형상 변경이 있으면 사용자가 요청할 때까지 기다리지 말고 진행하세요. 이미지 생성 도구를 사용할 수 없으면 제한 사항을 밝히고 보고서에 필요한 도해를 설명하세요.

이미지를 만들기 전에 배치 상태를 미리 점검하세요.

- Choose the smallest set of callouts needed to explain the fix.
- Estimate whether labels will crowd the geometry, overlap each other, or run outside the canvas. If crowding is likely, flag it before generation and switch to numbered markers plus a side legend, a larger canvas, or separate detail views.
- Keep long measured values and rule text in the legend, not directly over dense geometry.
- Include the measured failing distance, the cited minimum, and the proposed movement or clearance target.

이미지를 만든 뒤 전달 전에 결과를 확인하세요. 라벨이 겹치거나 잘리거나 읽기 어렵거나 형상을 가리면 보고하기 전에 도해를 다시 만들거나 수정하세요.

## DXF 검토

레이저 판재 절단은 최신 자료와 측정된 DXF 형상 정보를 기준으로 검토합니다.

다음 항목을 확인하세요.

- single, uploadable DXF file with model geometry at 1:1 scale
- units and overall part size; treat missing, unsupported, or unexpected `$INSUNITS` as a scale error until the user confirms units
- closed cut profiles where the service requires closed contours
- degenerate or zero-area closed contours, two-point closed polylines, and odd-degree cut endpoints
- duplicate or overlapping cut geometry
- unsupported annotation, text, dimensions, images, construction lines, or hidden instruction layers
- layer/color/linework conventions from the ordering guide and upload workflow
- bend-line entities, bend segment lengths, split/common-axis bends, local flange depth on both sides of each bend line, nearest non-bend cut edge or cutout distances, bend-line span coverage, insufficient bend contact/support, die-area or bend-adjacent cut geometry crossings, and cut geometry touching or crossing bend lines when bending is in scope
- minimum holes, slots, web widths, interior geometry, part density, nesting, and spacing only when both source facts and measured file facts support a comparison
- secondary-service requirements for bending, tapping, countersinking, hardware, finishing, or deburring when requested

## STEP 검토

CNC 라우팅 또는 3D 모델 업로드는 최신 자료와 측정된 STEP 형상 정보를 기준으로 검토합니다.

Check for:

- STEP/STP file readability and a solid body rather than loose curves or surfaces
- units, scale, bounding box, thickness, and feature dimensions
- sheet-metal bend radii when bending is in scope; compare measured cylindrical bend-face radii to the selected SKU's `bending_specs.effective_bend_radius` or `bending_specs.bend_radius`
- sharp inside corners, small holes/slots, thin walls, islands, deep pockets, tool access, and tolerances only when the file inspection can measure the fact
- whether geometry represents a sheet profile better served as DXF for laser cutting
- material, thickness, finish, and secondary-service compatibility

## 보고

파일 경로, 가정한 서비스, 재료/주문 정보, 조회 날짜와 함께 확인한 출처 파일, 검사한 형상 정보, 실제 영향이 큰 순서로 정렬한 발견 사항, 구체적인 후속 수정 사항을 포함하세요. 발견 사항 표에는 `Rule source` 열을 두고 출처 URL과 해당 행에 적용한 JSON 필드 경로 또는 가이드 절을 Markdown 링크로 표시하세요. 직접 파일 검사만으로 작성한 행에 외부 규칙이 없다면 `Direct file inspection`이라고 적고 출처를 비워두지 마세요. 필수 출처 확인 항목이 모두 통과하거나 선택한 서비스 범위 밖이라고 명시되지 않는 한 파일을 "SendCutSend ready"라고 부르지 마세요.

구조화된 보고서가 도움이 되면 `references/report-template.md`를 사용하세요.

## 참고 자료

- Official source selection: `references/official-sources.md`
- Report shape: `references/report-template.md`
