# 결과 중심 스펙 원칙에 따른 문서 점검

2026-11-11에 결과 중심 원칙을 기준으로 global 진입점과 제품 여정, 주요 app/package owner 문서, SDD·기능 상태·백로그를 대조했다. 이 점검은 제품 기능 수락이나 전체 코드와 문서의 의미 일치를 재검증한 것이 아니다. 기준 원칙은 [문서 scope 규칙](../documentation-scopes.md)과 [SDD 운영 규칙](../architecture/spec-driven-development.md)이다.

## 판정

Global → app → package의 소유 구조는 유지할 만하다. 다만 문서 체계는 아직 **결과 계약과 현재 구현 설명을 일관되게 구분하지 않는다.** 일부 문서는 성공 기준을 내부 구현 단어로 적고, 일부는 현재 코드의 세부 절차를 목표 구현의 필수 방식처럼 읽히게 한다. 세부 구현이 많다는 것 자체보다, 그것이 보장하려는 결과와 구현 선택의 규범성이 표시되지 않은 점이 핵심 문제다.

이 점검에서 [제품 여정](../product/프로젝트%20정의.md)은 사용자 관찰 결과 중심으로 수정했다. 다른 owner 문서는 아래 우선순위대로 점진적으로 정리한다. 현재 상태를 기록한 세부사항은 결과 계약을 증명하거나 중요한 예외를 설명하면 유지한다.

## 발견 사항

| ID     | 우선순위 | 문서와 관찰                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 개선 방향                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ROS-01 | 처리     | [제품 여정](../product/프로젝트%20정의.md)의 J-01~10 성공 기준이 stable identity, ACK, CRDT/cache, pipeline 같은 내부 메커니즘을 결과와 같은 수준에 뒀다.                                                                                                                                                                                                                                                                                                                                | 사용자에게 관찰되는 성공·실패 결과를 중심으로 다시 썼다. 내부 계약은 owner 스펙에 둔다.                                                                                                                                                                                                                                                                             |
| ROS-02 | 처리 중  | 기존 [PKMS folder sync](../architecture/workspace/pkms/folder-sync.md)는 product decision, 현재 구현, research, 목표 architecture, imperative algorithm을 한 문서에 뒀다.                                                                                                                                                                                                                                                                                                   | 새 [folder sync 스펙 색인](../architecture/workspace/pkms/folder-sync/README.md)과 하위 reconciliation/durability/protocol/UI/deletion/current-status 문서로 분리했다. 사용자 결과, 규범 계약, source 구현, 배포 상태를 구분했다. 다만 code audit에서 새 root 연결 시 기존 baseline이 유지되는 삭제 위험을 찾았고, source fix·destructive test는 아직 필요하다. |
| ROS-03 | P1       | [Desktop Terminal](../architecture/workspace/terminal/README.md), [Browser lifecycle](../architecture/workspace/browser/lifecycle.md), [layout](../architecture/workspace/layout/README.md), [runtime](../architecture/workspace/runtime/README.md)은 상태 owner, 호출 경로, 내부 상수/알고리즘으로 시작한다. 이 영역은 포커스, 데이터 순서, 재시작 복원처럼 복합 결과가 있어 상세 근거가 유용하지만, 현재 acceptance 중 일부는 내부 구현 경계 자체를 요구한다. | 각 문서 상단에 사용자/시스템 목표 상태와 결과 acceptance를 먼저 둔다. DOM attach 순서·timer·helper·내부 sequence는 “현재 구현 관찰”로 구분한다. 입력/출력 유실, 잘못된 focus, dirty 상태 소실 등 결과를 바꾸는 세부만 normative contract로 승격한다.                                                                                                                |
| ROS-04 | P1       | [Home UI](../architecture/workspace/home/README.md)는 목표 결과를 별도 구분했지만 HOME-UI-05는 “구독과 timer 수명”, HOME-UI-01은 CPU sampling의 내부 null 시점을 acceptance로 표현한다. [Home Server](../architecture/workspace-server/README.md)의 token 검증과 OAuth state 소비는 반대로 보안·권한 결과가 달려 있어 상세가 정당하다.                                                                                                                                      | UI acceptance는 화면을 떠난 후 오래된 결과가 상태를 덮거나 불필요한 갱신이 계속되지 않는 결과로 표현한다. 첫 CPU 값도 측정 전 수치를 0으로 오해하지 않는 결과를 기준으로 둔다. Server token signature/audience/scope/expiry, state replay 방지 등 안전 경계는 구체적으로 유지한다.                                                                                  |
| ROS-05 | P2       | [Editor package specs](../architecture/editor/README.md)와 [provider 계약](../architecture/editor/provider.md)은 public API·capability를 명확히 하지만 내부 hook 순서, exact helper behavior와 재구현 순서도 계약처럼 섞여 있다. 공개 API와 error/cancel 결과는 package 소비자에게 중요하다. 내부 effect 순서는 대체 구현을 불필요하게 제한할 수 있다.                                                                                                                  | 소비자가 관찰하는 API 결과, capability, 취소·stale response·dirty close 결과는 유지한다. public export가 아닌 hook/effect/정렬 알고리즘은 동등한 결과를 검증하는 참고 구현으로 분리한다. 접근성/시각 수치가 의도된 요구인지 현재 스타일인지 구분한다.                                                                                                               |
| ROS-06 | P2       | [PKMS iOS](../architecture/pkms/ios/README.md), [PKMS client](../architecture/pkms/client/README.md), [settings/usage](../architecture/workspace/settings/README.md)는 retry 횟수·cache TTL/개수·poll 간격·내부 owner를 비교적 자세히 기록한다. 일부는 mutation 중복 방지·비밀 보호와 관련 있지만, 나머지는 현재 선택값에 가깝다.                                                                                                                                       | 네트워크 재시도·저장/eviction·secret 접근은 데이터 손실·중복·보안 결과에 연결되는 값인지 표시한다. 단순 UI refresh/countdown 주기는 목표 freshness를 만족시키는 현재 구현으로 분류하고, 목표상 반드시 그 값이어야 하는 근거가 없으면 acceptance로 고정하지 않는다.                                                                                                  |
| ROS-07 | P2       | 여러 문서의 수락 ID가 존재하지만 테스트 이름, 구현 수치, 제품 결과가 같은 표에 섞여 있다. 특히 [Web](../architecture/pkms/web/README.md)와 [Home Server](../architecture/workspace-server/README.md)는 integration/behavioral 검증 부족을 적었지만 사용자 결과와 실행 증거를 모두 연결하진 않는다.                                                                                                                                                                              | 각 수락 ID에 결과 문장, 정상/실패 입력, 검증 evidence, 상태(unverified/automated/manual/operational)를 연결한다. 내부 helper unit test는 해당 결과의 일부 근거인지 범위를 제한한다.                                                                                                                                                                                 |

## 결과 스펙이 더 필요한 영역

문서가 모듈 구조와 현재 상태를 설명하는 것만으로 제품 결과가 정해졌다고 보지 않는다. 다음은 현재 planning에서 owner/acceptance가 충분히 분해되지 않은 후보이며, 구현 누락으로 단정하지 않는다.

- [J-01](../product/프로젝트%20정의.md): 손상 layout salvage에서 사용자가 보존 가능한 pane과 복구 불가 항목을 어떻게 확인하는가.
- [J-04](../product/프로젝트%20정의.md): browser 복구 실패·다운로드 취소/실패 후 사용자가 재시도·파일 열기·기록 확인을 할 수 있는가.
- [J-05](../product/프로젝트%20정의.md): 형식별로 사용자에게 약속하는 최소 표시/조작 수준과 지원 불가 안내가 무엇인가.
- [J-06/J-07](../product/프로젝트%20정의.md): offline 변경의 보존 경계, 해결이 필요한 충돌을 사용자가 찾고 완료 여부를 확인하는 결과가 무엇인가.
- [J-09](../product/프로젝트%20정의.md): agent evidence가 오래됐을 때 UI가 최신 상태로 오해되지 않게 하는 사용자 결과와 데이터 출처 표시.
- [J-10](../product/프로젝트%20정의.md): update 실패 시 설치된 버전·롤백/재시도 가능성·사용자 복구 경로를 어디까지 보장하는가.

이 항목은 제품 결정이 필요할 수 있으므로 owner 코드에서 구현 방식을 추측해 요구사항으로 추가하지 않는다. 승인된 목표 결과가 정해진 뒤 app/package 스펙과 수락 기준으로 연결한다.

## 권장 정리 순서

1. Global journey 결과 문장을 기준으로 app 모듈별 결과/실패 acceptance를 정렬한다.
2. folder sync처럼 현재/목표/연구가 한 문서에 섞인 고위험 데이터 계약을 분리한다.
3. Terminal·Browser·layout의 결과 acceptance를 먼저 배치하고 구현 세부를 current evidence 하위로 이동한다.
4. package public contract와 내부 helper 설명을 나누고, 결과에 영향 없는 수치·호출 순서를 normative에서 제거한다.
5. 기존 수락 ID를 outcome → evidence → validation status로 연결한다.

각 단계는 문서 단위로 커밋하고 behavior/code 수정과 분리한다. source digest나 링크 검사 통과만으로 결과 계약이 충분하다고 판정하지 않는다.
