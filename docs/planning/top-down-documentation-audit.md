# 전체 문서 감사와 개선 기획

> 이 문서는 2026-11-11 최초 감사 시점의 24개 발견 사항을 보존한 snapshot이다. 아래 항목은 후속 문서 작업에서 다룬 뒤에도 원래 발견 근거로 남아 있을 수 있으므로 현재 미해결 목록으로 그대로 해석하지 않는다. 최신 slice별 진행 상태는 [SDD 실행 로드맵](./spec-driven-development-roadmap.md#실행-진행-상태), 현재 scope와 잔여 검증은 [스펙 운영 문서](../architecture/spec-driven-development.md)를 본다.

2026-11-11의 활성 코드·문서를 제품 → 시스템 경계 → 상태와 계약 → 사용자 흐름 → 모듈 → 검증 순서로 대조했다. 가장 시급한 문제는 상위 문서의 오래된 설명이 현재 모듈의 스펙과 충돌한다는 점이다. 새 문서의 양을 늘리기 전에 기준과 상태를 맞춰야 한다. 실행 순서와 완료 조건은 [SDD 전환 계획](./spec-driven-development-roadmap.md)에 둔다.

## 조사 범위와 판정

대상은 Workspace Desktop, PKMS Web/Server/iOS, Workspace Home Server와 공유 editor/client/protocol/core다. 앱 entrypoint, 디렉터리별 책임, 공개 타입, persistence/IPC, package script, CI workflow, 기존 architecture/planning/guide와 모듈 docs를 대조했다. 이 문서는 제품 개선을 기획하는 감사이며, 모든 함수의 전 분기나 실제 배포 상태를 검증한 보고서는 아니다.

- `누락`: 해당 책임을 독립 구현할 계약이 없음. README나 다른 문서의 한 문장 언급은 상세 스펙으로 세지 않음.
- `개요`: 경계·의도는 있으나 schema/상태 전이/실패·수명/검증이 부족함.
- `동작 스펙`: 주요 계약과 수락 시나리오가 있음. 전 API·전 UI 분기의 완전성이나 재생성 성공을 뜻하지 않음.
- `불일치`: 현재 코드 또는 더 구체적인 기준 문서와 다른 설명이 공존함.
- `개선 후보`: 코드 구조·검증에서 확인한 부담. 제품 결함으로 단정하거나 이번 감사에서 자동 리팩터링하지 않음.

활성 Markdown 46개를 대상으로 한 로컬 파일 링크 검사에서는 깨진 대상이 없었다. fenced code, 일반 backtick 경로, heading anchor, 외부 URL 내용은 이 검사에 포함하지 않았다. 따라서 없는 TerminalSurface 파일을 prose에서 가리키거나 예전 상태 소유자를 설명하는 문제는 링크 검사 통과와 양립한다. archive·legacy·research의 이전 제안, cancelled Android Data Node와 생성물·vendor·빌드 산출물은 활성 기능 누락으로 계산하지 않았다.

## 제품에서 내려다본 커버리지

| 계층/책임 | 현재 상태 | 보강해야 할 기준 | 소유 위치 |
|---|---|---|---|
| 제품 범위·사용자·핵심 여정 | 누락 | Workspace/PKMS/Home의 문제, 기능 경계, 플랫폼 차이, 제외 범위, 여정별 성공/실패 | 최상위 docs/product 색인 → 앱별 product 문서 |
| 전체 시스템 context | 개요 | Desktop 외 Web/Worker/Supabase/GitHub/iOS/Core 포함한 실행·데이터·인증 경계 | docs/architecture 전체 지도 |
| 앱 bootstrap·종료·재시작 | 누락 | single instance, hydration, 창 복구, detached PTY, crash와 정상 종료 구분 | workspace-app/docs/runtime |
| Workspace·pane·탭·layout | 개요·불일치 | 상태 소유자, mutation API, preview/pin, 이동/닫기, salvage/export/schema | workspace-app/docs/layout |
| Interaction·focus·portal·drag | 개요 | 정책 입력·결정표·nested lock·포커스 복귀·종료/취소 수명 | workspace-app/docs/interaction |
| 공통 IPC·파일시스템 | 개요 | 전체 channel, DTO, sender/path 범위, 오류·취소·구독 해제 | workspace-app/docs/ipc、filesystem |
| Terminal 세션·출력·replay | 개요·불일치 | daemon handshake, sequence/ACK/credit, UTF-8, replay와 scroll/fit 상태 전이 | workspace-app/docs/terminal |
| Terminal 입력·IME·clipboard·OS | 누락 | 입력/단축키 우선순위, paste/drop/OSC52, 한글/emoji, WSL/PowerShell | workspace-app/docs/terminal |
| Shared Editor provider·surface·cache | 동작 스펙 | 모든 공개 export의 계약과 실행 테스트 연결, readOnly·오류 복구의 host 책임 | packages/editor/docs |
| Treeview·Quick Open·검색 | 동작 스펙 | tree host와 provider 경계, 검색 취소·치환 동시성, 패키지 독립 검증 | packages/editor/docs + Desktop docs |
| Markdown·code·문서 탭 UI | 동작 스펙 일부 | decoration 분기표/fixture, tab chip/menu/name form, CSS와 theme contract | packages/editor/docs |
| Browser | 동작 스펙 | coordinator 계약과 native focus acceptance, session/download/fullscreen 세부 검증 | workspace-app/docs/browser |
| Image/PDF/audio/video | 연결 개요 | 포맷별 전체 UX·zoom/seek/subtitle·에러·URL 수명·Range | workspace-app/docs/viewers |
| EPUB | 누락 | protocol→loader→paginator→TOC/검색/선택→테마→읽기 위치 저장 | workspace-app/docs/viewers/epub |
| 3D import/preview | 누락 | sniff/resolve/import queue/cache/manifest/protocol/render, 실패·취소·fallback | workspace-app/docs/viewers/model3d |
| CAD/robot 문서 viewer | 누락 | 활성 앱의 외부 viewer 연결·변환·로컬 서비스 수명 | workspace-app/docs/viewers/cad |
| Home dashboard와 시스템 정보 | 개요 | provider 연결 상태·로딩/오류·갱신, 기기 CPU/메모리/스토리지 의미 | workspace-app/docs/home |
| Home API·provider OAuth·저장 | 개요 | routes/DTO, Home token, OAuth callback/state, grant 암호화/갱신/삭제 | workspace-server/docs |
| PKMS Web adapter | 개요 | canonical origin/internal header/service binding/SSR/proxy cookie 흐름 | pkms-web/docs |
| PKMS client 앱 흐름 | 개요 | 로그인·workspace·파일 작업·assets·presence·cache·플랫폼별 수명 | pkms-client/docs |
| PKMS 서버 | 개요 | route inventory, account/vault, auth/device/MCP, DB RPC·R2·GitHub export | pkms-server/docs |
| PKMS HTTP·Realtime 계약 | 일부 계약 | 실제 handler↔TS/Swift DTO↔status/error, version/호환 정책 | pkms-protocol + server docs |
| PKMS folder sync·delete | 상세 설계·불일치 | 현재 source/배포/acceptance 상태, durable queue와 conflict 복구 단일 기준 | Desktop docs/pkms + server docs |
| PKMS iOS | 빌드 개요 | Keychain·cache·session/realtime·SwiftUI·Swift↔C↔Rust ownership | pkms-ios/docs |
| Rust Core·FFI·WASM | 개요 | path/UTF-16/CRDT 규칙, C buffer ownership, 실제 바인딩과 미사용 target 구분 | pkms-core/docs |
| Agent 상태·hook·rollup | 누락 | evidence 우선순위·freshness·terminal identity·UI 집계·hook 서버 | workspace-app/docs/agents |
| Usage meter | 누락 | 표시 가능한 provider와 실제 data adapter, 인증/캐시/실패/설정 | workspace-app/docs/usage |
| 설정·theme·zoom·UI 정책 | 디자인 원칙 | defaults/storage/migration/적용 범위, pane/guest/font zoom 구분 | 앱·editor 소유 docs |
| 로그·오류·복구 | 로그 정책 일부 | log category·민감내용·opt-in·회전·진단 수집, 복구 UX와 책임 | workspace-app/docs/observability |
| 릴리스·업데이트·플랫폼 | 개요·불일치 | 활성 플랫폼 정책, native ABI/sign/update 상태·실패·복구·검증 기록 | workspace-app/docs/release |
| 테스트·CI·스펙 운영 | 부분 검사 | 영향 범위, acceptance 추적, source 추가 감지, 재생성 실험 | scripts/CI + 소유 모듈 docs |

이는 책임 단위 지도다. file count나 digest 개수로 문서 커버리지 백분율을 계산하지 않는다.

## 확인된 불일치와 검증 공백

P0는 후속 작업자가 잘못된 구조/데이터 계약을 구현하거나 변경을 배포에서 빠뜨릴 수 있는 항목이다. P1은 핵심 기능 재구현·복구를 막는 누락, P2는 사용성과 유지 비용을 줄이는 보강이다.

| ID | 우선순위·종류 | 증거 → 발견 → 개선 작업 |
|---|---|---|
| AUD-01 | P0·불일치 | [layout 개요](../architecture/03-workspace-and-layout.md)는 App modelsRef·PaneGroup localActiveId를 소유자로 설명한다. [실제 소유권 문서](../../apps/workspace-app/src/renderer/src/layout/STATE.md), [workspaceStore](../../apps/workspace-app/src/renderer/src/store/workspaceStore.ts), [layoutSession](../../apps/workspace-app/src/renderer/src/layout/layoutSession.ts)은 module model Map·persisted config·selection revision을 사용한다. 상위 개요와 실제 mutation 흐름을 맞추고 STATE를 기준 문서에서 연결한다. |
| AUD-02 | P0·불일치 | [folder-sync](../architecture/pkms/folder-sync.md)는 로컬 folder 삭제 미전파·delete intent 비영속을 현재 상태로 적지만 [local-deletion-sync](../architecture/pkms/local-deletion-sync.md)는 소스 구현 완료/배포·acceptance 대기라고 명시하고 [syncBridge](../../apps/workspace-app/src/main/pkms/syncBridge.ts)는 durable intent를 갖는다. source/배포/실기 검증을 구분해 같은 기능 상태를 가리키게 한다. |
| AUD-03 | P1·누락 | [IPC 개요](../architecture/02-process-and-ipc.md)는 주요 channel 일부만 열거한다. [contentApi](../../apps/workspace-app/src/preload/contentApi.ts), [systemCapabilities](../../apps/workspace-app/src/main/ipc/systemCapabilities.ts), [agent IPC](../../apps/workspace-app/src/main/ipc/agentStatus.ts)의 content/system/usage/agent/조건부 쓰기·stream 검색·ACK 계약이 빠져 있다. 전체 route/DTO/범위/실패/수명 표가 필요하다. |
| AUD-04 | P1·불일치 | [terminal 문서](../architecture/05-terminal-pipeline.md)의 앞부분은 scheduler dependency closure가 없다고 쓰고 뒤 progress는 포팅 완료로 쓴다. `panes/TerminalSurface.tsx` 설명도 현재 [TerminalPane](../../apps/workspace-app/src/renderer/src/panes/TerminalPane.tsx) 중심 수명과 다르다. 과거 문제·포팅 작업·현재 계약·남은 acceptance를 분리한다. |
| AUD-05 | P1·정책 충돌 | [앱 README](../../apps/workspace-app/README.md)는 양 플랫폼 준비 후 publish를 요구하고 [릴리스 정책](../architecture/desktop-release.md)은 현재 활성 macOS 우선, 비활성 플랫폼은 blocker가 아니라고 한다. 배포 진입점과 가이드가 단일 정책을 링크하게 한다. |
| AUD-06 | P1·상태 불일치 | [백로그](./backlog.md)는 Editor 통합 전체를 다음 작업으로 두지만 [통합 계획 구현표](./editor-unification.md)는 다수 implemented와 acceptance 미완료를 구분한다. [기능 상태](./feature-status.md)의 앱 경계도 완료 단계와 남은 OAuth 설정을 충분히 구분하지 않는다. 새 구현·검증·운영 설정을 별도 완료 단위로 쪼갠다. |
| AUD-07 | P1·QA 불일치 | [QA](../guides/manual-qa-checklist.md)는 Plus/Minus가 browser guest가 아닌 pane을 확대한다고 적지만 [browserZoom](../../apps/workspace-app/src/renderer/src/browser/browserZoom.ts)과 [BrowserContent](../../apps/workspace-app/src/renderer/src/panes/BrowserContent.tsx)는 guest zoom 경로를 갖는다. 활성 focus/host에 따른 shortcut 표와 기대 결과를 만든다. 월드 엔진 제목 아래 fullscreen 항목도 실제 Browser 책임으로 재분류한다. |
| AUD-08 | P0·CI 공백 | [Web deploy workflow](../../.github/workflows/deploy-pkms-web.yml)의 paths에 `packages/editor/**`가 없다. [pkms-client manifest](../../packages/pkms-client/package.json)는 editor를 의존한다. Editor만 바뀐 push가 Web deploy trigger에 포함되지 않으므로 공유 의존성에 맞춰 paths와 검증 영향 범위를 고친다. |
| AUD-09 | P1·검증 도구 | [run-vitest](../../apps/workspace-app/scripts/run-vitest.mjs)는 전달받은 인자를 소비하지 않고 vitest run 전체를 실행한다. 앞 작업의 영역 필터가 무시된 원인이다. targeted/full 명령, native ABI 복원, exit 상태·GC 옵션을 명시하고 수정 검증한다. |
| AUD-10 | P1·검증 범위 | [check.sh](../../scripts/check.sh)는 Desktop typecheck와 foundation test 5개 파일을 실행한다. [CI](../../.github/workflows/deploy-pkms-server.yml)는 typecheck/deploy 중심이다. spec checker·protocol 검사·서버 behavioral test·cross-client acceptance가 공통 gate로 연결되지 않았다. 영향 단위별 gate를 설계한다. |
| AUD-11 | P1·계약 누락 | [서버 workspace router](../../apps/pkms-server/src/workspaceApi.ts), [vault](../../apps/pkms-server/src/SupabaseVault.ts), [TS DTO](../../packages/pkms-protocol/src/types.ts), [Swift DTO](../../apps/pkms-ios/PKMSProtocolModels.swift)는 실행 계약을 담고 있으나 endpoint별 method/auth/request/response/error/동시성/호환성의 단일 구현 스펙이 없다. 현재 사용하는 타입과 handler를 기준으로 작성한다. Realtime model 검사를 HTTP route 완전성 검증으로 해석하지 않는다. |
| AUD-12 | P1·검증 추적 | [Editor 수락 시나리오](../../packages/editor/docs/README.md)와 browser 스펙에는 ID가 생겼지만 각 ID↔정확한 test case/수동 기록↔검증 범위의 연결이 없다. 대부분 테스트는 Desktop 아래 있어 공통 패키지의 독립 재구현을 검증하기도 어렵다. 사례별 실행 근거와 unverified 표시가 필요하다. |
| AUD-13 | P1·스펙 상세 부족 | [Editor 코드 스펙](../../packages/editor/docs/code/README.md)·[Markdown](../../packages/editor/docs/markdown/README.md)은 주요 전이를 설명하지만 [공개 exports](../../packages/editor/src/index.ts)의 tab/menu/name form 세부, decoration 모든 분기·CSS·호스트 차이를 다 담지 않는다. 근거 파일을 링크했다는 이유로 그 동작 전체를 재생성 가능으로 표시하지 않는다. |
| AUD-14 | P2·drift 한계 | [스펙 인덱스](../architecture/spec-index.json)와 [검사기](../../scripts/check-architecture-specs.mjs)는 등록한 파일의 hash·존재·링크를 확인한다. 새 파일/미등록 모듈, 문서-의미 일치, heading anchor, acceptance 추적은 확인하지 않는다. source 등록과 semantic review의 책임을 분리한다. |
| AUD-15 | P1·영속 상태 누락 | [persistence](../../apps/workspace-app/src/main/persistence.ts), [layout salvage](../../apps/workspace-app/src/shared/layoutSalvage.ts), [session buffer](../../apps/workspace-app/src/shared/terminal-session-buffers.ts), [ebook state](../../apps/workspace-app/src/main/ebookState.ts)가 각기 데이터 수명을 갖는다. 저장 위치/schema/version/소유자/원자성/손상/삭제/복구를 묶은 inventory가 없다. 재시작·정상 종료·crash의 데이터 보존 계약을 만든다. |
| AUD-16 | P1·Home 누락 | [Home README](../../apps/workspace-server/README.md)는 운영 설정 중심이다. [Home auth](../../apps/workspace-server/src/auth.ts), [serviceIntegrations](../../apps/workspace-server/src/serviceIntegrations.ts), [store](../../apps/workspace-server/src/store.ts)의 routes·OAuth·refresh·credential 수명과 UI 상태 계약이 빠져 있다. 외부 설정 완료와 코드 구현 완료를 구분한다. |
| AUD-17 | P1·백로그 정밀도 | [백로그](./backlog.md)는 Home Activity Monitor/Storage를 다음 작업으로 적지만 [SystemInformationWidget](../../apps/workspace-app/src/renderer/src/dashboard/widgets/SystemInformationWidget.tsx)과 system summary handler는 CPU/메모리/홈 볼륨 정보를 이미 제공한다. 기본 summary, 프로세스별 monitor, 상세 storage 분석을 다른 범위로 정의한다. 기존 위젯이 Activity Monitor 전체 구현임을 뜻하지 않는다. |
| AUD-18 | P1·PKMS 앱 흐름 누락 | [PkmsClientApp](../../packages/pkms-client/src/PkmsClientApp.tsx)는 약 1,750행의 조립·파일 작업·선택·저장·UI 동작을 갖지만 [session 문서](../../packages/pkms-client/docs/editor-sessions.md)는 editor adapter 일부만 다룬다. account/files/client/realtime/platform/host event와 주요 여정별 state owner를 문서화한다. 파일 길이만으로 즉시 분해하지 말고 계약을 먼저 고정한다. |
| AUD-19 | P1·네이티브 계약 | [core README](../../packages/pkms-core/README.md)의 UniFFI 설명과 [iOS wrapper](../../apps/pkms-ios/NativeMarkdownDocument.swift)의 C 함수 사용, [build script](../../apps/pkms-ios/scripts/build-rust-framework.sh)의 header 기반 XCFramework 경로를 함께 설명해야 한다. [ffi 구현](../../packages/pkms-core/crates/pkms-ffi/src/lib.rs)에 두 표면이 존재한다. Swift handle/buffer free·UTF-16·오류·실제 target을 구분한다. |
| AUD-20 | P1·agent 누락 | [hook server](../../apps/workspace-app/src/main/workspaceAgentHookServer.ts), [agent 상태 store](../../apps/workspace-app/src/renderer/src/store/agentStatusStore.ts), [freshness](../../apps/workspace-app/src/shared/agent-status-freshness.ts), title/parser/rollup의 증거 우선순위와 state transition 문서가 없다. stale hook·종료·재연결·pane 이동의 상태를 정의한다. |
| AUD-21 | P2·사용량/설정 누락 | [usage settings](../../apps/workspace-app/src/shared/usage-meter-settings.ts)에는 5개 provider ID가 있지만 [usage handler](../../apps/workspace-app/src/main/usage.ts)의 데이터 획득과 UI 지원 범위를 별도 문서로 확인해야 한다. [theme](../../apps/workspace-app/src/renderer/src/theme.ts), autosave·pane/guest/font zoom도 저장·적용 범위와 default를 명시한다. |
| AUD-22 | P1·viewer 누락 | [Asset 연결 스펙](../../packages/editor/docs/assets.md)은 내부 전체를 범위 밖으로 뒀다. [model3d router](../../apps/workspace-app/src/main/model3d/assetRouter.ts), [import queue](../../apps/workspace-app/src/main/model3d/importJobQueue.ts), [EPUB](../../apps/workspace-app/src/renderer/src/panes/EpubReaderContent.tsx), [CAD adapter](../../apps/workspace-app/src/main/cadViewer.ts)의 전체 파이프라인·포맷별 fallback·자원 정리가 필요하다. archive CAD 모델과 활성 viewer를 혼동하지 않는다. |
| AUD-23 | P2·관측/복구 누락 | [logging guide](../guides/logging.md)는 회전·무손실 보관을 설명하지만 [startup](../../apps/workspace-app/src/main/startupLog.ts), [log sink](../../apps/workspace-app/src/main/debugLogSink.ts), 오류 UI를 연결한 장애별 진단/복구 표는 없다. 민감 terminal bytes·보관·opt-in 정책을 보존하며 index에 연결한다. |
| AUD-24 | P1·제품 범위와 문서 책임 | [기능 상태](./feature-status.md)는 agent/usage/settings/recovery를 독립 책임으로 보이지 않게 묶고 [앱 경계](../architecture/08-monorepo-module-boundaries.md)는 목표 패키지와 구현 패키지를 함께 보여준다. capability inventory에 제품·플랫폼·구현/운영/검증 상태와 문서 owner를 붙인다. cancelled Data Node를 자동 재개하거나 목표 패키지를 존재하는 API로 취급하지 않는다. |

## 아키텍처 개선 후보의 처리 원칙

다음은 문서만 고쳐 해결되지 않을 수 있는 후보이며, 구현 변경이 필요하면 해당 스펙과 테스트를 먼저 만든다.

| 후보 | 실제 근거 | 착수 조건 |
|---|---|---|
| PKMS UI와 sync bridge 책임 분리 | PkmsClientApp 약 1,750행, syncBridge 약 1,350행에 여러 수명·상태 조합 | 사용자 여정/queue 상태 계약을 고정하고 경계별 테스트 확보 후 기능 단위 분리 |
| IPC 타입 정밀화와 contract 수집 | preload 일부 반환이 unknown, DTO/handler가 여러 파일에 분산 | 현재 null/error/구독 의미를 먼저 기록하고 무손실 호환 확인 |
| 파일 분류 단일 기준 검토 | TreeView/local provider/Markdown link/media classifier의 확장자 목록 차이 | 기존 route별 결과 fixture 확정; 의도된 차이와 결함을 구분 후 통합 여부 결정 |
| 설정 저장/손상/복구 규칙 통일 | renderer localStorage와 main JSON 저장이 각기 존재 | data inventory와 migration 요구를 먼저 확정; 개인정보/보관 정책 유지 |
| 패키지 독립 검증 | shared editor/client 테스트가 앱 검사에 종속 | dependency·테스트 runner 범위를 정리하고 CI에서 각 소비자 연결도 검증 |
| Browser/Terminal 자원 예산 | persistent guest, detached PTY, view/cache는 수명이 다름 | 실제 자원 측정과 보존 UX를 먼저 정의. 임의 eviction을 문서 정비에 섞지 않음 |

## 이번 감사의 산출물과 한계

산출물은 책임별 커버리지 지도, AUD-01~24 발견 사항과 [실행 계획](./spec-driven-development-roadmap.md)이다. 각 발견은 코드/문서 근거와 수정 방향을 연결했다. 기존 제품 코드를 감사만으로 대량 변경하거나 오래된 문서를 일괄 삭제하지 않았다.

이번 읽기 검증에서 기존 스펙 인덱스 4개 모듈·15개 문서·106개 소스 digest 검사가 통과했다. 당시 protocol 검사도 통과했지만 그 성공은 검사 대상 모델 범위의 결과이며 전체 route·동시성·복구 계약 검증을 뜻하지 않는다. 이전 단계의 61개 영역 test 통과/전체 suite 6개 실패는 [검증 기록](../architecture/spec-driven-development.md)에 남아 있고 이번 감사에서 전체 suite나 native 앱 acceptance를 재실행하지 않았다.

배포 migration, 외부 provider secrets, 최신 실제 로그인/동기화 결과는 로컬 코드만으로 확인할 수 없다. 따라서 문서에서 이들을 implemented/deployed/accepted로 구분하는 일이 우선이다.
