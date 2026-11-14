# 문서 scope와 소유 규칙

문서는 global → app → package 순서로 읽되 계약을 정의하는 곳은 실제 코드 소유자다. 상위 문서는 하위 동작을 복제하지 않고 연결한다. 현재 동작, 향후 계획, 검증 기록을 구분한다.

## 결과 중심 스펙 원칙

스펙의 기본 목적은 **목표 상태와 그 결과를 정의하는 것**이다. 요구마다 누가 어떤 조건에서 무엇을 하며, 시스템이 어떤 상태가 되고 사용자가 관찰할 수 있는 결과가 무엇인지, 실패·취소·복구 후 어떤 결과를 보장하는지를 먼저 적는다. 수락 기준은 이 결과를 검증한다.

구현 절차, 내부 함수 순서, timer·cache 같은 선택은 기본 스펙으로 요구하지 않는다. 구현 선택에 따라 결과가 달라지거나 잘못된 선택이 데이터 손실·보안 문제·호환성 파괴를 만들며 선택지가 많은 경우에만 필요한 수준의 구현 계약을 기록한다. 예를 들어 PKMS protocol의 wire shape/versioning과 인증의 token 검증·만료·권한은 서로 다른 구현으로 만들면 소비자나 보안 결과가 달라지므로 구체적으로 규정한다. 내부 구현은 현 상태의 근거로 링크할 수 있지만, 목표 결과를 만족하는 구현 방법 하나를 유일한 방법처럼 고정하지 않는다.

상위 문서는 사용자·제품 결과를 정의하고, app 문서는 그 결과를 앱 상태/화면/배포 경계로 구체화하며, package 문서는 여러 소비자가 지켜야 할 공개 결과와 상호운용 계약을 정의한다. 기존 구현에서 역추출한 문서도 관찰된 현재 결과와 의도된 목표 결과를 구분한다.

## Scope 판정

| Scope   | 책임                                                                                        | 위치                                                               | 상세를 넣지 않는 것                                            |
| ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| global  | 제품 범위·사용자 여정, 시스템 context, 제품 간 의존·인증·데이터 경계, 문서 정책과 전체 계획 | `docs/product`, `docs/architecture`, `docs/planning`, `docs/guides` | 특정 앱 내부의 timer·storage key·component lifecycle·함수 목록 |
| app     | 배포/실행 가능한 앱의 bootstrap·상태·adapter·protocol 처리·화면 흐름·운영/복구              | `docs/architecture/<기능 영역>`                                   | 공유 패키지의 UI·도메인 구현 계약 복사                         |
| package | 소비 앱과 독립적인 공개 API·타입·불변식·extension point·오류·검증                           | `docs/architecture/<기능 영역>`                                   | 앱 자격 증명·실제 배포 origin·OS 권한·제품별 저장 정책         |

문서의 책임 범위는 global/app/package로 구분하지만, 파일은 소스 모듈의 `docs/` 폴더로 분산하지 않고 저장소 루트 `docs/` 아래에 기능 단위로 모은다. 앱과 패키지 README는 실행 방법과 루트 문서 링크만 제공한다.

예를 들어 text surface·tree selection은 editor package, Workspace 파일 쓰기는 Desktop app, PKMS Yjs 연결은 pkms-client package, PKMS server mutation은 server app, Web/Desktop/iOS의 제품 차이는 global에 속한다.

## 하나의 동작에는 하나의 기준

동작의 값을 정하는 owner 문서만 상수·schema·전이표를 갖는다. 소비자는 입력/출력·선행 조건과 owner 링크를 둔다. 두 앱을 가로지르는 흐름은 global에서 경계별 호출 순서를 설명하고 각 앱 상세에 연결한다. source 옆에 기존 기준 문서가 있으면 이동 전에 외부 링크를 조사하고 이전 위치를 짧은 안내로 남긴다.

`architecture`는 구현된 계약과 명시적으로 분리된 제한을 설명한다. 미구현 제안·마이그레이션 순서는 planning에 둔다. 과거 사고·포팅 과정은 현재 규칙과 구분해 기록한다. 동작하지 않는 예전 경로를 현재 owner로 남기지 않는다.

## 상태와 근거

기능 구현 상태와 문서 검증 상태는 별도다. 구현됐다는 근거는 코드 연결, 배포됐다는 근거는 운영 기록, acceptance 통과는 해당 환경의 실행 결과다. 로컬 문서 작업으로 외부 migration·secrets·로그인·native acceptance를 완료 처리하지 않는다.

문서 상태는 inventory → drafted → reviewed → validated → regeneration-verified이며 각 의미는 [SDD 계획](./planning/spec-driven-development-roadmap.md)에 정의한다. 이번 코드 추출 문서는 명시된 주요 분기를 대조한 drafted/reviewed 범위이며 모든 분기의 재생성을 검증했다는 뜻이 아니다.

## 작업과 커밋

한 작업은 한 scope의 독립 계약을 작성하거나 하나의 불일치를 수정하는 단위다. 관련 링크·상태·스펙 인덱스를 같은 커밋에서 갱신한다. 앱과 패키지를 함께 고치는 경우에도 소비/제공 계약의 연결을 설명한다. 제품 동작 변경은 문서 정리 커밋에 섞지 않는다.

각 커밋 전 source 대조, 로컬 링크, `git diff --check`, 등록된 source digest를 확인한다. 실행 검증은 문서에 적은 실제 명령과 범위만 주장한다. source hash 갱신은 검토·테스트 통과의 대체가 아니다.

## 읽는 경로

[제품과 여정](./product/프로젝트%20정의.md) → [시스템 context](./architecture/01-overview.md) → [기능별 문서 색인](./architecture/README.md) 순서로 읽는다. 전역 색인은 [문서 안내](./README.md), 남은 작업은 [계획 색인](./planning/README.md)에서 찾는다.
