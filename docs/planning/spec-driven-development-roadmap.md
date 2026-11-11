# 제품 전체 SDD 전환 계획

목표는 기능별 개요를 늘리는 것이 아니라 **제품 요구 → 모듈 계약 → 구현 → 수락 근거**가 끊기지 않게 만드는 것이다. [Top-down 감사](./top-down-documentation-audit.md)의 24개 발견 사항을 아래 작업 묶음으로 처리한다. 이번 작업에서 채택된 것은 감사·기획과 미사용 계약 파일 정리이며, 아래 제품 리팩터링과 CI 변경은 실행할 후속 계획이다.

## 제품 기획 기준

기준 사용자는 한 작업 공간에서 terminal/browser/editor를 함께 쓰는 Desktop 사용자와, 같은 PKMS 저장소를 Web/Desktop/iOS에서 사용하는 사용자다. Home은 기기 상태와 외부 서비스 연결을 보여주는 별도 제품 책임으로 취급한다. 목표 경험은 다음과 같다.

| 핵심 여정 | 성공 기준 | 반드시 규정할 실패·복구 |
|---|---|---|
| workspace를 열고 pane을 배치해 다시 시작 | 탭·선택·파일·허용된 terminal 상태 복원 | 손상 layout, 닫기 취소, crash, 프로세스/기기 재시작의 차이 |
| Markdown/code를 찾고 수정하고 저장 | 안정 identity, dirty/저장/원격 sync 표시 일관성 | 로드 경쟁, disk 충돌, readOnly, 저장 실패, 취소/폐기 |
| terminal에서 장시간 명령/TUI 사용 | bytes·Unicode·색상·scroll·입력·focus 보존 | parser 정체, reconnect/replay, daemon 종료, IME와 OS 차이 |
| browser 탐색과 다른 pane 전환 | URL/history/download·native focus·drag 일관성 | guest 종료, 주소창/overlay 충돌, 재부착, 로그인 권한 |
| 로컬 파일·attachment·책·모델 열기 | 포맷별 올바른 pipeline, 상태와 자원 정리 | 잘못된 포맷/대용량/변환 실패/취소/임시 URL·프로세스 해제 |
| PKMS 저장소 연결과 문서 협업 | 계정·workspace·CRDT·presence·캐시 동작 일치 | 만료 세션, offline, 동시 변경, 재접속·mirror 지연 |
| 로컬 PKMS 폴더에서 편집/이동/삭제 | durable intent와 cursor, 손실 없는 충돌 처리 | scan 실패·누락 root·stale delete·timeout·중복 retry |
| Home 서비스 연결과 기기 상태 확인 | 로그인/OAuth/상태/설정 대기 구분 | provider 장애, token 만료, grant 해제, 기기 metrics unavailable |
| agent 상태·usage·설정 확인 | 실제 근거와 freshness, 표시 가능한 범위 명확 | stale evidence, 알 수 없는 provider, 인증/측정 실패 |
| 앱 업데이트와 장애 진단 | 활성 플랫폼에서 native package·update 경로 검증 | 다운로드/서명/설치 실패, 보류와 정상 종료, 진단·복구 |

새 기능 추가와 전 플랫폼 동시 출시는 이 문서화 계획의 완료 조건이 아니다. 현재 구현과 남은 acceptance를 정확하게 기록한다. cancelled Android Data Node, archive CAD 모델·실험의 구현 재개도 포함하지 않는다.

## 문서 소유 구조

최상위는 context·상태·연결을 소유하고 기능 상세는 코드 소유 모듈 옆에 둔다. 다음 트리는 예정 목적지이며 아직 존재하지 않는 파일을 현재 스펙으로 링크하지 않는다.

```text
docs/
  product/                         # 제품/플랫폼/사용자 여정 색인과 범위
  architecture/                    # 시스템 context, 모듈 지도, 스펙 운영, 링크
  planning/                        # 감사·실행 순서·미완료 acceptance
  guides/                          # 개발/운영 가이드 색인, 실제 절차는 owner 문서 연결
apps/workspace-app/docs/
  product.md
  runtime/ layout/ interaction/ ipc/ filesystem/ persistence/
  terminal/ editor/ browser/ viewers/ home/ agents/ usage/ settings/
  observability/ release/
apps/workspace-server/docs/         # Home API/OAuth/저장/운영
apps/pkms-web/docs/                 # SSR/canonical origin/proxy/deploy
apps/pkms-server/docs/              # auth/routes/vault/storage/realtime/mcp/github
apps/pkms-ios/docs/                 # 앱 상태/session/cache/native build
packages/editor/docs/              # UI/provider/helpers/acceptance
packages/pkms-client/docs/         # 계정/workspace/files/session/platform/cache
packages/pkms-protocol/             # 실제 TS DTO/Realtime schema + 계약 문서
packages/pkms-core/docs/            # 도메인/UTF-16/CRDT/FFI/WASM
```

폴더명 하나당 반드시 파일을 만들지 않는다. 독립 상태·계약·검증 책임이 생길 때 문서를 분리한다. 기존 파일은 재작성 전에 보존할 과거 설명과 새 기준 위치를 확인하고, 이동 후 top-level 링크를 남긴다.

## 단계별 실행과 완료 조건

| 작업 | 우선순위·규모 | 선행 | 산출물·완료 기준 | 감사 연결 |
|---|---|---|---|---|
| WP-01 제품·기능 inventory | P0·M | 없음 | 기능별 제품/플랫폼/owner/구현·배포·acceptance 상태/문서/검증을 한 행으로 관리. 10개 핵심 여정을 각 모듈과 연결. 연구·취소·목표 패키지를 구분 | AUD-06/17/24 |
| WP-02 기존 기준 충돌 정리 | P0·M | WP-01과 병행 | layout·sync·terminal·release·QA의 확인된 충돌 제거. 현재 계약과 과거 문제·목표·작업 기록 분리. 최상위는 owner spec에 연결. Editor 잔여 acceptance를 별도 작업으로 명시 | AUD-01/02/04/05/06/07 |
| WP-03 시스템·상태·계약 지도 | P0·L | WP-01 | 전체 context와 Desktop 프로세스/서비스 경계, IPC/HTTP/Realtime/FFI route inventory, 영속 데이터 inventory. 각 계약은 실제 구현 위치와 타입에 대응 | AUD-03/11/15/19/24 |
| WP-04 영향 기반 검증 정비 | P0·M | WP-01, WP-03 일부 | 공유 Editor 변경이 Web CI trigger에 포함. targeted test 인자·full test/native ABI·GC 환경 정리. 알려진 실패와 새 회귀 분리. docs/protocol/영역 검사를 영향 단위로 실행 | AUD-08/09/10 |
| WP-05 Shell·layout·interaction 스펙 | P1·L | WP-02/03 | bootstrap/hydrate/close/move/split/preview/pin/focus/overlay/drag 결정표와 persistence schema. 정책 helper·integration fixture와 연결 | AUD-01/03/15 |
| WP-06 Terminal 전 경로 스펙 | P1·L | WP-03/04/05 | daemon→main→renderer→scheduler→xterm와 역방향 input/ACK/recovery를 한 계약으로 설명. UTF-8/credit/replay/fit/scroll/IME/clipboard/OS 시나리오별 검증 기록 | AUD-04/09/10 |
| WP-07 PKMS 데이터·동기화 스펙 | P1·L | WP-02/03/04 | 서버 auth/account/vault/route/DB RPC와 client/local folder queue·delete/conflict/Realtime·GitHub mirror를 연결. source/배포/실기 acceptance를 독립 표기 | AUD-02/11/16/18 |
| WP-08 Editor·Browser 스펙 완성 | P1·M~L | WP-03/04/05 | 공개 API 전체 대응, Markdown decoration fixture, 문서 탭/메뉴/이름 UI, host 차이, browser download/session/focus. 수락 ID마다 test 또는 manual evidence와 unverified 상태 | AUD-12/13/14 |
| WP-09 Home·agents·usage·settings | P1·L | WP-01/03/05 | UI 상태와 API/설정/수명 연결. OAuth 운영 대기, system summary 의미, agent evidence priority/freshness, usage 실제 지원 범위·theme/zoom/defaults 구분 | AUD-16/17/20/21 |
| WP-10 Viewer 전 경로 스펙 | P1·L | WP-03/04/05 | image/PDF/media/EPUB/model3d/CAD별 입력·상태·오류·protocol·queue/cache/cleanup. native dependency와 Python adapter 실행 경계 명시 | AUD-22 |
| WP-11 Web/iOS/Core·운영 스펙 | P1·L | WP-03/07 | Web canonical/proxy/SSR, iOS session/cache/Keychain/native FFI, Core invariants·바인딩. release/update/log/diagnostic·복구 runbook | AUD-05/19/23/24 |
| WP-12 재생성 검증·운영 고정 | P1·M~L | WP-04, 대상 WP별 상세 완료 | 독립 모듈부터 clean-room 복원 실험. 요구 ID↔source↔test/evidence 추적. 신규 source/미소유 기능·anchor·dependency 문서 검사 보강 | AUD-10/12/13/14 |

S/M/L은 한 번의 파일 편집/모듈 조사/여러 런타임 경계 조사 규모를 표현하며 일수·담당자·마감일을 확정한 추정이 아니다. 실제 실행 시 WP-06/07/10 같은 큰 작업은 아래처럼 수락 가능한 slice로 쪼갠다.

## 권장 착수 순서

첫 묶음은 WP-01·02·03의 최소 inventory와 WP-04다. 현재 코드의 기준을 틀리지 않게 만들고, 이후 스펙 변경을 검증할 수 있는 실행 경로를 확보한다. 두 번째 묶음은 Shell/interaction을 고정한 뒤 Terminal과 PKMS처럼 상태 보존·데이터 손실 영향이 큰 흐름이다. 세 번째 묶음은 기존 Editor/Browser 스펙을 완성하고 Home/agents/viewer/platform을 채운다. 각 영역이 준비되면 마지막까지 기다리지 않고 WP-12의 작은 재생성 실험을 수행한다.

| 첫 실행 slice | 구체 행동 | 종료 조건 |
|---|---|---|
| A 기준 정렬 | layout 소유권 문서 연결, sync 현재 상태 모순 제거, release 단일 기준, Editor acceptance 잔여 작업 분리 | 상위 문서를 따라도 실제 구현/검증 대기 상태를 잘못 이해하지 않음 |
| B CI·test 경로 | Editor→Web paths 반영, test wrapper 인자/ABI/GC 처리, 명령 문서 갱신 | Editor-only 변경 영향이 선택되고 지정한 test만 실행됨; 실패 exit 유지 |
| C 최소 상태 inventory | Workspace/layout/terminal/editor/PKMS/ebook/credentials/settings/logs의 저장·소유·손상/복구 표 | 표의 각 저장물이 실제 파일/DB/storage API와 연결 |
| D 첫 재생성 실험 | tree selection/navigation/projection 또는 URL normalization 중 한 독립 단위 선택 | 문서만으로 구현한 결과가 고정 fixture·기존 테스트를 통과하고 미명시 분기를 스펙에 환류 |

## 문서별 필수 계약

모든 문서에 같은 장황한 template를 강제하지 않는다. 재생성 대상 모듈에는 다음 정보가 빠지지 않아야 한다.

1. 사용자 문제·책임·입력/출력·제외 범위·소유자와 의존 방향.
2. 공개 타입/enum/default/상수·단위·encoding·ID/path/revision 규칙. 기존 TS/Swift/Rust 타입을 기준으로 사용한다.
3. 상태 owner와 초기/로딩/활성/저장/완료/실패/취소/종료 전이. sync와 durable save처럼 독립 상태는 별개 축으로 표시.
4. concurrency·stale response·abort·queue·retry/idempotency·conflict 정책.
5. persistence 위치/schema/version/migration·복구와 정상 종료/crash 차이.
6. DOM/native/network/process/observer/timer/URL/subscription의 생성·해제 책임.
7. 사용자 입력·shortcut·ARIA·focus·UI 토큰. 시각 재생성이 범위면 수치와 viewport별 fixture도 포함.
8. 요구 ID·source·test case 또는 manual 기록·남은 검증. 성공뿐 아니라 오류·경합·복구 시나리오를 포함.

파일 목록·함수명 나열·코드 통째 복사는 동작 스펙의 완료 조건으로 인정하지 않는다. 여러 제품이 공통 UI를 써도 host 저장/인증/이미지/링크 정책이 다르면 adapter 차이를 명시한다.

## 계약 지도와 영속 데이터 inventory

WP-03은 새 미사용 schema 체계를 도입하지 않고 실제 사용 중인 코드 계약을 연결한다. HTTP는 method/path/auth/request/response/status/error/side effect와 TS/Swift DTO를, Realtime은 channel/message/token/cursor/recovery를, IPC는 invoke/send/event·sender·payload·결과·취소·구독 수명을, FFI는 ABI·메모리·encoding·실패 규칙을 적는다.

영속 데이터 표는 location/owner/schemaVersion/writer/atomicity/sensitive/retention/migration/corrupt recovery/delete responsibility를 가진다. 최소 항목은 workspace layout, terminal replay/scrollback, editor identity/view cache/dirty, explorer state, ebook position, PKMS token/cache/CRDT/queue/cursor/baseline, Home grant, theme/autosave/usage 설정, viewer import cache와 logs다. 앱 userData·renderer storage·DB·OS Keychain·서버 저장소를 혼동하지 않는다.

## 스펙 상태와 완료 판정

| 상태 | 의미 | 진입 근거 |
|---|---|---|
| inventory | 코드 책임/기준 위치만 조사 | 실제 owner와 source 확인 |
| drafted | 현재 동작 계약을 추출 | 상태/입출력/오류/수명·미검증 범위 명시 |
| reviewed | source와 계약 전이 대조 | 주요 분기와 경합을 검토한 기록 |
| validated | 수락 시나리오 검증 | 자동/수동/플랫폼별 결과와 실패·skip 포함 |
| regeneration-verified | 문서에서 독립 복원 검증 | 원본 구현 참조 없이 만든 산출물과 대조 결과 |

기존 기능 상태 implemented/in_progress와 별개로 관리한다. 기능이 구현돼도 스펙은 inventory일 수 있고, 상세 설계가 있어도 런타임 acceptance는 대기일 수 있다. 기존 문서와 초기 Editor/Browser 스펙을 일괄 validated나 regeneration-verified로 올리지 않는다.

상태 registry의 owner는 이름이 아니라 코드 소유 앱/패키지다. 사람이 검토했다는 근거 없이 hash refresh로 reviewed를 올리지 않는다. 실제 schema 도입은 WP-12에서 정하되 이 상태 의미부터 고정한다.

## 재생성 실험 설계

복원 실험은 별도 임시 디렉터리·브랜치에서 수행하며 활성 소스 삭제로 시작하지 않는다. 재생성 작업자는 대상 스펙·공개 의존 타입·lockfile과 입력 fixture를 사용할 수 있지만 대상 원본 구현은 읽지 않는다. 검증자는 고정된 기존 테스트/새 black-box fixture로 정상·오류·취소·경합을 비교한다. 독립 agent를 쓸 때도 대상 source를 함께 전달한 대화를 그대로 fork하면 clean-room 조건이 충족되지 않으므로 별도 최소 context가 필요하다.

첫 대상은 순수 helper다. 다음은 fake provider의 tree/surface, 이어서 Desktop host adapter다. native PTY·browser guest·클라우드·iOS는 실제 환경 acceptance를 별도 gate로 둔다. 어떤 레벨에서 어느 fixture를 통과했는지 기록하며 ‘모듈 하나 통과’를 제품 전체 재생성 가능으로 확대하지 않는다.

기능 등가성 외에 시각 동등성·성능·메모리/손실 없는 데이터 보존이 필요한 영역은 요구를 사전에 명시하고 측정 기준을 정한다. 기준이 없는 수치를 임의 성능 목표로 추가하지 않는다.

## 테스트·운영의 개선 범위

- source digest 검사는 drift 단서로 유지하되 신규 source와 owner 부재 감지, 로컬 anchor, 요구 ID 중복/검증 누락, module dependency 영향 범위를 별도 검사한다.
- Realtime 검사와 HTTP handler/DTO 검증을 구분한다. HTTP 호환성 검증은 실제 모델과 응답 fixture를 기준으로 설계하고 route 전체 문서화와 혼동하지 않는다.
- app/package별 test·typecheck·contract check와 실행 전제(native ABI·GC·OS)를 명시한다. 기존 6개 실패는 baseline으로 숨기지 않고 재현→수정/환경 분리→원인 기록으로 처리한다.
- spec-only 변경은 link/index와 계약 대조를, 공유 UI/DTO 변경은 소비 앱 검증을, native dependency/업데이트 변경은 활성 플랫폼 installed build를 검증한다.
- 외부 secrets 등록, DB migration 적용, release publish, 실제 데이터 복구 작업은 별도 운영 작업과 근거로 관리한다. 로컬 소스 검토로 완료 처리하지 않는다.

## 완료 정의

상위 지도에서 활성 기능마다 실제 소유 모듈·현재 상태·기준 문서·검증 경로를 찾을 수 있어야 한다. 같은 동작을 설명하는 모순된 기준은 없어야 한다. 핵심 사용자 여정은 정상·실패·경합·재시작/복구를 따라가며 관련 계약을 추적할 수 있어야 한다. 미검증 native/배포 단계와 재생성 미실행 범위가 보이고, 독립 복원에 성공한 단위만 그 상태를 갖는다.

모든 기능의 clean-room 복원을 한 번에 끝내야 문서 개선을 반영할 수 있는 구조로 만들지 않는다. 각 slice는 현재 코드와 일치하는 계약·실행 검증·남은 범위가 함께 남으면 완료할 수 있다.
