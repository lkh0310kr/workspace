# 저장소 전체 리팩터링 마스터 계획

## 목표와 불변 조건

- 범위: `workspace` 저장소의 추적 경로 1,682개 전체를 평가한다. 공개 API, IPC, 저장 형식, 부수 효과 순서, 재시도·취소·오류 동작, 빌드 결과를 보존한다.
- 기준선: 2026-11-16, 브랜치 `main`. 기존 사용자 작업: `docs/guides/REFACTOR.md` 삭제, `.agents/skills/refactor/` 미추적 상태. 보존 대상이다.
- 확인한 아키텍처 지침: `AGENTS.md`, `docs/architecture/spec-driven-development.md`, `docs/architecture/spec-index.json`.
- 실행한 기준 검사: `node scripts/check-architecture-specs.mjs` 실패. 추적 파일 `docs/guides/README.md`가 사용자가 삭제한 `./REFACTOR.md`에 연결된다. 원본과 참조는 변경하지 않았다.
- 확인한 루트 검증 명령: `npm run check`(workspace-app 타입 검사, editor-tree 계약 검사, 일부 Vitest), `npm run check:app`, `npm run check:editor-tree-contract`, web/server 타입 검사, `node scripts/check-architecture-specs.mjs`. 이번 계획 단계에서는 코드 테스트를 실행하지 않았다.
- 사용자가 `workspace-app` 진행을 재개했다. 이번 배치는 R-001 내부를 조사한다. 외부 작업 영역은 기존 지정 범위대로 유지한다.

## 탐색 범위 인벤토리

아래 개수는 상호 배타적인 최상위 모듈 경로별 추적 파일 수다. 중첩된 벤더·생성 파일은 해당 영역 검토 중 별도로 분류하기 전까지 영역 합계에 포함한다. 추적 경로를 임의로 누락하지 않는다. `ref-proj`는 읽기 전용 참조 체크아웃이므로 제품 리팩터링에서 제외한다. 잠금 파일·생성물·빌드 결과·벤더·대용량 정적 자산·과거 archive 자료는 해당 영역 검토 중 경로와 근거를 기록해 분류한다.

| 영역 ID | 실제 경로 | 추적 파일 | 조사 담당 | 검토 상태 | 보류·제외 사유 |
| --- | --- | ---: | --- | --- | --- |
| R-001 | `apps/workspace-app/**` | 766 | coordinator + 읽기 전용 조사 담당 | reviewed; T-026/T-027/T-029/T-030/T-031/T-032/T-033 validated | 하위 5개 영역 정적 검토 완료; 실행·통합 검증 한계와 위험은 별도 기록 |
| X-002 | `apps/pkms-ios/**` | 141 | — | 제외 | 사용자가 요청한 범위 제외 |
| R-003 | `apps/pkms-server/**` | 51 | coordinator + read-only agent | reviewed; T-025 validated | literal subtree path 일치 수정; Vault flush/recovery는 revision·lease 보호를 확인했으나 recovery 특성화 테스트 부재, MCP OAuth는 계약 테스트 부재로 보류
| R-004 | `apps/pkms-web/**` | 30 | read-only agent + coordinator | reviewed; T-028 validated | workspace 전환 전 기존 문서 sync 및 실패 시 현재 workspace 보존을 helper acceptance로 검증; 실제 OAuth/browser runtime은 미실행
| R-005 | `apps/workspace-server/**` | 12 | read-only agent | reviewed; candidate deferred | 인증 state·D1·token lifecycle·provider 오류 격리 테스트 선행 필요; 확정된 결함 없음
| X-003 | `apps/android-data-node/**` | 15 | — | 제외 | 사용자가 요청한 범위 제외 |
| R-007 | `packages/editor/**` | 68 | read-only agent | reviewed; candidate deferred | package exports/deep import 경계는 resolver intent 확인 전 보류
| R-008 | `packages/pkms-client/**` | 42 | read-only agent | reviewed; T-019/T-022 validated |
| R-009 | `packages/pkms-core/**` | 11 | read-only agent | reviewed/no-change |
| R-010 | `packages/pkms-google-drive/**` | 18 | read-only agent | reviewed; T-018 validated |
| R-011 | `packages/pkms-protocol/**` | 5 | read-only agent | reviewed/no-change |
| X-004 | `archive/**` | 307 | — | 제외 | 사용자가 요청한 R-012 이후 범위 제외 |
| X-005 | `docs/**` | 96 | — | 제외 | 사용자가 요청한 R-012 이후 범위 제외 |
| X-006 | `.agents/**`, `.claude/**`, `.cursor/**` | 110 | — | 제외 | 사용자가 요청한 R-012 이후 범위 제외; 기존 미추적 작업 보존 |
| X-007 | `.github/**` | 6 | — | 제외 | 사용자가 요청한 R-012 이후 범위 제외 |
| X-008 | `scripts/**` | 6 | — | 제외 | 사용자가 요청한 R-012 이후 범위 제외 |
| X-009 | 루트 manifest/config/docs | 11 | — | 제외 | 사용자가 요청한 R-012 이후 범위 제외 |
| M-001 | `.codex/refactor/**` | 2 | coordinator | 계획 메타데이터 | 리팩터링 계획·진행표이며 제품 코드 조사 범위에 포함하지 않음 |
| X-001 | `ref-proj/**` | 1 | — | 제외 | 읽기 전용 참조 체크아웃; 리팩터링 편집 금지 |

인벤토리 합계: 추적 경로 1,698개 = 현재 범위 1,003개 + 제품 코드 제외 693개 + 계획 메타데이터 2개. 현재 범위는 R-001~R-011 중 R-002와 R-006을 제외한 9개 영역이다. R-012~X-001은 모두 제외했다. 9개 범위 영역의 정적 검토와 경로 분류를 완료했다. R-001 renderer는 399개 의미 검토, 22개 vendor/정적 자산 분류로 미검토 경로가 없다. R-003은 51개 경로를 검토했고 subtree LIKE wildcard 위험을 literal prefix migration 및 local DB 재현 테스트로 해결했다. Vault/MCP 분리 후보는 계약 테스트 부족으로 보류했다. R-004는 workspace 전환 시 기존 문서 저장·sync 순서를 T-028에서 수정했다. R-001b는 workspace 간 persist timer 경쟁을 T-029에서 수정했다. R-008 parentPath 중복 단일화(T-019), local item ID 단일화(T-022), R-010 SHA-256 helper 단일화(T-018)를 검증했다. 나머지 영역도 위험·검증 공백이 있는 후보를 별도 기록했다. 2026-11-16 재집계(`git ls-files -z`) 결과 R-001은 766개, R-003은 51개, R-004는 30개, R-008은 42개다. 초기 계획의 737개는 기준 시점에서 14개 과소 집계였고, 이후 작업 중 추가된 경로를 재집계에 반영했다. 파일 수는 경로 분류 합계이며 모든 경로가 리팩터링 후보라는 뜻은 아니다.

### R-001 앱 내부 분할과 조사 체크포인트

| 하위 영역 | 경로 | 추적 파일 | 상태 | 현재 조사 근거 |
| --- | --- | ---: | --- | --- |
| R-001a | `apps/workspace-app/src/main/**` | 172 | 검토 완료; T-026/T-031/T-033 validated | 코드 경로·설정·테스트 assertion의 정적 검토 완료; OBJ root escape와 agent-hook startup race를 수정. binary preview 디스크 read는 async 처리. Base64/IPC 메모리 비용 및 Linux IME 준비 지연은 별도 검증 위험 |
| R-001b | `apps/workspace-app/src/renderer/**` | 421 | 검토·분류 완료 | 399개 소스/테스트 의미 검토, 22개 vendor/정적 자산 분류; 미검토 경로 0; 테스트 실행·runtime 검증은 별도 한계 |
| R-001c | `apps/workspace-app/src/preload/**` | 8 | 검토 완료; T-032 validated | runtime `contentApi`·`systemApi`를 기존 공개 `WorkspaceApi`의 부분 타입으로 검사; IPC payload runtime validation은 범위 밖 위험으로 별도 기록 |
| R-001d | `apps/workspace-app/src/shared/**` | 89 | 검토 완료; 계약 위험 기록 | agent/usage/layout/media/terminal·PKMS shared 책임 확인; terminal capture timeout listener 정리·correlation 위험 기록 |
| R-001e | 앱 루트·scripts·resources 등 나머지 | 76 | 검토·분류 완료; 후속 위험 기록 | 텍스트 설정/build/release/workflow 스크립트 검토; notarization·Windows secret workflow·Vitest 인자 전달 차이 기록; vendor patch/바이너리·visual assertion의 일부 상세 내용은 제외/부분 검토로 명시 |

앱 내부 합계: 766개. (172 + 421 + 8 + 89 + 76) 하위 조사 분할은 서로 겹치지 않는다. 다섯 영역 모두 정적 검토 또는 vendor/asset 분류를 마쳤으며 테스트 실행·패키지/실제 OS 런타임 검증은 별도 한계로 남겼다.

공유 수정 소유권: 진행 담당이 루트 manifest/config, `.github/**`, `scripts/**`, 문서와 이 계획을 소유한다. 각 영역 담당은 공유 파일 변경을 제안할 수 있지만 통합은 순차적으로 진행 담당이 맡는다. `ref-proj/**`는 절대 수정하지 않는다.

## 의존성과 배치

| 배치 | 작업 ID | 선행 공유 계약 | 안전한 병렬 수정 소유자 | 검증 게이트 |
| --- | --- | --- | --- | --- |
| 0 | T-000 | 현재 범위 전체 영역 검토와 후보 선정 | 읽기 전용 조사 후 조정 | 9개 영역 정적 검토 완료; 잔여 위험 기록 |
| 1 | T-001 | agent 제목 식별 중복 단일화 | coordinator, 전용 파일 2개 | 집중 테스트 및 앱 체크 통과 |
| 1 | T-002a | sync bridge에서 교차 프로세스 폴더 잠금 책임 추출 | `folderSyncLock.ts`와 전용 테스트, `syncBridge.ts` 호출부 | 잠금 수명 단위 테스트, 25개 syncBridge 테스트, 앱 체크 통과 |
| 1 | T-002b | PKMS API 오류 변환·업로드·원격 읽기 프로토콜을 별도 내부 모듈로 추출 | `syncBridgeRemote.ts`, `syncBridge.ts`, 관련 테스트 | durable create/update와 syncOnce 오케스트레이션은 Main에 유지; 25개 통합 테스트 |
| 1 | T-002c | 자산별 로컬·원격 조정 로직을 context 기반 내부 모듈로 분리 | `syncBridgeAssets.ts`, `syncBridge.ts` | 병렬 worker·snapshot retry·공유 map 순서 유지; syncBridge 25파일/31테스트 |
| 2 | T-002d | watcher/poller/realtime/timer/재시도 수명주기를 내부 runtime 모듈로 분리 | `syncBridge.ts`, `syncBridgeRuntime.ts` | syncOnce·tree API는 Main에 유지; watcher/retry/restart/offline/root-switch/folder-lock 테스트 선행 |
| 2 | T-002e | 단일 Markdown `reconcilePath` 책임을 내부 모듈로 분리 | `syncBridge.ts`, `syncBridgeMarkdown.ts` | 6-worker pass/preload/cursor 상태는 Main에 유지; 지정 conflict/ack/pagination 테스트 선행 |
| 2 | T-003 | Drive 전용 문서 session 함수를 테스트 후 내부 모듈로 분리 | `PkmsGoogleDrivePane.tsx`와 신규 session 모듈 | 500ms autosave·save serialization·durable close·1,250ms sync 상태 계약 테스트 및 visual acceptance |
| 1 | T-004 | usage status bar의 공통 countdown/color helper를 공유 | renderer usage bars/helper/test | 경계 테스트 및 typecheck 통과 |
| 1 | T-005 | Workspace 내부 중복 `Tab` 타입 제거 | `workspace.ts` | Node typecheck 통과; baseline lint 비교 |
| 1 | T-006 | PKMS preload API object 추출, 공개 bridge 표면 유지 | `preload/index.ts`, `pkmsDesktopApi.ts` | typecheck·lint 및 채널/인자 비교 |
| 1 | T-007 | ADAPT-03 저장 중 편집 경합과 watcher echo를 spec 계약에 맞게 수정 | `localEditorProvider.ts`, 계약 테스트 | race 재현 테스트 및 typecheck |
| 1 | T-008 | `LocalDocumentSession`을 provider orchestration에서 별도 모듈로 추출 | renderer local editor adapter/test | T-007 이후 editor tests 및 typecheck |
| 1 | T-009 | cooked OSC 응답 경로의 중복 regex를 canonical 상수로 대체 | `terminal-query-reply.ts` | 6개 테스트 및 lint baseline 비교 |
| 1 | T-010 | terminal scrollback 기본값·normalization·backlog 정책을 shared owner로 통일 | shared policy, renderer imports | default·clamp·backlog 수치 보존; backlog/buffer/cold-restore 4개 테스트 |
| 2 | T-011 | Drive pane branch cache/loading/generation/deferred expansion owner 분리 | `PkmsGoogleDrivePane.tsx`, renderer branch module | 5개 black-box lifecycle acceptance와 기존 tree/Quick Open/CRUD visual tests |
| 1 이후 | T-012 | PKMS Drive/legacy IPC 등록 책임 분리, 공개 채널 계약 보존 | `main/pkms/ipc.ts`와 전용 테스트 | 37개 채널 계약 테스트·typecheck·root check |
| 1 이후 | T-013 | SearchPanel의 검색 취소·stale 결과·stream·replace 계약을 테스트로 고정 | renderer 전용 테스트 파일 | focused Vitest·typecheck |
| 1 이후 | T-014 | SearchPanel query debounce/abort/stream 수명주기를 좁은 hook으로 추출 | `SearchPanel.tsx`, 신규 renderer hook | T-013 acceptance·typecheck·root check |
| 1 이후 | T-015 | browser download DTO의 runtime/declaration 중복 단일화 | preload runtime/type declaration, 신규 shared DTO | typecheck·public type shape 비교 |
| 1 이후 | T-016 | viewer extension set 단일 owner화, classifier 결과/우선순위 보존 | shared asset/CAD, renderer mediaKind 및 tests | focused classifier tests·typecheck·root check |
| 1 이후 | T-017 | content search IPC의 request/cancel lifecycle을 분리하고 event contract 보존 | `main/ipc/workspace.ts`, 신규 search IPC module/tests | search request/cancel/result/done IPC acceptance·typecheck |
| 1 이후 | T-018 | Google Drive package 내 중복 SHA-256 hex 계산 단일화, payload identity 보존 | repository, operation log, asset conflict materializer, 신규 private helper | repository/log/asset focused tests·typecheck·root check |
| 1 이후 | T-019 | workspace tree cache의 parentPath 계산을 domain helper로 단일화 | `packages/pkms-client/src/client/workspaceTreeCache.ts`, 관련 contract test | helper 의미 비교 후 focused tests·typecheck |
| 1 이후 | T-020 | workspace tab shortcut hook이 UI component를 거치지 않고 canonical navigation owner를 직접 사용 | `renderer/src/hooks/useWorkspaceTabHotkeys.ts`, hook contract test | shortcut index·tab ID·empty index·listener cleanup 보존 |
| 1 이후 | T-021 | agent activity summary freshness cache가 동일 입력에서 만료 전환을 반영 | renderer selector와 focused test | AGENT freshness 예외 보존, fake-time·typecheck |
| 1 이후 | T-022 | PKMS client path 기반 local item ID 생성을 domain helper로 통일 | domain helper, 세 소비 경로, focused test | UTF-8/base64url ID·exact path semantics 보존 |
| 1 이후 | T-023 | Home 두 위젯의 refresh를 직렬화하고 HOME-UI-05 stale response/unmount 경계를 지킴 | 공통 refresh hook, 두 위젯, dashboard integration test | 진행 중 추가 호출 coalescing·await·cleanup 보존 |
| 1 이후 | T-024 | EPUB open error를 source 경로에 묶어 path 전환 뒤 reader 재로드를 허용 | EpubReaderContent, path-change lifecycle test | 이전 오류 및 취소된 source 결과 격리 |
| 1 이후 | T-025 | PKMS SQL subtree membership에서 `%`·`_`를 문자 그대로 비교 | R-003 new migration, pg SQL regression script | create/move/delete/asset scope와 slash boundary 보존 |
| 1 이후 | 검토 후 선정 | 패키지 간 계약 변경을 먼저 확정 | 서로 겹치지 않는 경로로 결정 | 영역별 집중 검사 후 루트 통합 검사 |

## 완료 조건

- 현재 범위 내 모든 영역을 `reviewed/changes-needed`, `reviewed/no-change` 또는 사유를 명시한 `blocked`로 기록한다.
- 채택한 각 작업을 검증하거나, 사유를 적어 보류·차단한다.
- 필수 검사를 실행하거나 실행 불가 사유를 기록한다. 사용자 삭제로 발생한 기존 문서 링크 실패는 리팩터링 실패로 돌리지 않는다.
- 남은 위험과 미조사 경로를 작업 완료 여부와 별도로 보고한다.

## 진행 체크포인트

- 마지막 완료 배치: workspace-app에서 Main/renderer/preload/shared의 저위험·경계형 리팩터링 및 ADAPT-03 저장 경합 수정
- 검토 영역 / 현재 범위: 9 / 9 (정적 검토 완료; runtime·통합 검증 한계와 후속 위험 별도 기록)
- 채택 작업 검증 완료 / 채택 작업 전체: 37 / 37 (T-001~T-033 완료)
- 기존 검증 실패: architecture-spec 링크 검사에서 사용자가 삭제한 `docs/guides/REFACTOR.md` 참조 발견
- 상태: 전체 범위 정적 검토 완료; 37개 작업 검증 완료; 고위험 경계 변경은 계약 테스트·정책 확인 전 보류
- 추가 검증: T-002c syncBridge 25파일/31테스트 통과; T-003 editor session 4파일/11테스트·typecheck 통과; usage helper 3테스트 통과; OSC reply 6테스트 통과; preload ESLint/typecheck 및 루트 `npm run check` 통과
- T-018 Google Drive SHA-256 helper 단일화 커밋 `f7cfaf46`; focused 28 tests, `npm run pkms:web:typecheck`, `npm run check` 통과. ESLint의 `workspaceRepository.ts` 반환형 위반 1개는 기준선에도 존재함을 확인했다. T-019 parentPath 중복을 domain helper로 단일화하고 삭제 자손·이웃 보존 및 동일 목록 참조 테스트를 추가, 커밋 `327cc25c`; focused 2 tests, 앱 typecheck 및 root check 통과. T-020 workspace tab hotkey hook을 canonical navigation owner에 직접 연결하고 mapping·범위 밖 index·listener cleanup 테스트를 추가, 커밋 `8b186ac0`; focused 2 tests, app typecheck, root check, changed-file ESLint/Prettier 통과. notarization 및 Linux build gate 불일치는 정책/릴리스 경계라 동작 변경을 보류한다. 사용자의 제외 범위와 기존 사용자 파일은 보존한다.
- T-021 agent activity summary selector cache의 freshness 만료 재계산을 보장하고 집중 테스트 3개와 앱 typecheck를 통과했다. Selector 재호출 시 신선도를 복구하며, 시간 경과만으로 UI를 자동 갱신하는 동작은 문서 계약에 없어 추가하지 않았다.
- T-022 PKMS client의 path 기반 synthetic local ID 인코딩을 domain helper로 합쳤다. rename/move, realtime conflict snapshot, subscribeTree fallback이 동일 UTF-8/base64url exact-path ID를 사용한다. focused 5 tests, PKMS web typecheck, root check 통과.
- T-023 HOME-UI-05를 구현해 Home 두 위젯이 refresh 요청을 1 in-flight + 1 coalesced pending으로 직렬화한다. stale 응답·unmount 이후 적용을 무효화하고, 기존 mutation 흐름의 `await refresh()` 완료 의미를 유지했다. dashboard/hook 2 tests, app typecheck, root check 통과.
- T-024 EPUB open error를 현재 tab/path identity에 결합했다. 실패 후 같은 component의 다른 path를 열 수 있고, 이전 source의 늦은 rejection은 새 책에 표시되지 않는다. mocked foliate DOM으로 path-change/cancel 2 tests, app typecheck 통과; 실제 EPUB rendering은 검사하지 않았다.
- T-025 PKMS 경로 prefix를 `left(path,length(parent)+1)=parent||'/'`로 비교하는 helper를 추가하고 conflict path, operation apply, asset sync의 최종 함수 정의를 갱신했다. `%`/`_` 삭제 가드·삭제 범위·move recursion·create conflict·asset conflict 회귀가 로컬 Postgres에서 재현 후 통과했다. 6개 SQL transaction scripts, PKMS server typecheck, root check 통과.
- T-026 `objHasExternalResources`에서 MTL 파일 읽기를 제거해 기존 판정값을 유지했고, `resolvePackage`는 canonical 경로가 workspace root 안에 있는 MTL만 읽도록 제한했다. traversal과 root 밖 symlink 회귀를 수정 전 실패/수정 후 통과로 확인했다. Viewer 스펙에 경계를 기록했다.
- T-027 FileViewer 미리보기 state를 `{tabId,filePath}` source identity에 묶어 경로 전환 첫 commit에서 이전 Blob을 표시하지 않도록 했다. 이전 URL revoke와 stale async 취소를 보존하고 deferred second-preview 테스트, app typecheck, root check를 통과했다.
- T-028 PKMS Web workspace 교체 전에 열린 문서 `save()`가 `synced`를 반환하는지 확인하고, 이어 새 runtime sync를 마친 뒤 기존 session을 닫도록 했다. 이전 sync가 pending/blocked이거나 새 sync가 실패하면 기존 runtime/session을 유지한다. Node lifecycle 4 tests와 PKMS Web typecheck 통과; 브라우저/OAuth runtime은 검사하지 않았다.
- T-029 layout 저장 debounce를 workspace tab ID별 Map으로 바꿔 같은 workspace 요청만 coalesce하고 다른 workspace 요청은 각각 IPC에 전달한다. hydrate에서 사라진 workspace의 timer도 취소한다. 두 workspace 동시 예약 및 같은 workspace 최신값을 확인하는 focused test, app typecheck, root check, lint/Prettier 통과.
- T-030 `run-vitest.mjs`가 `npm test -- <필터>` 인자를 Vitest까지 전달하도록 수정했다. `npm test -- --help`에서 Vitest CLI 도움말을 확인했고, `npm test -- src/shared/terminal-session-buffers.test.ts`는 지정한 파일만 실행해 3개 테스트가 통과했다. native dependency rebuild/restore 단계도 정상 종료했다.
- T-031 agent-hook server를 기다린 뒤 status URL callback을 Workspace factory에 전달하도록 startup 순서를 바꿨다. server bind 실패는 로그를 남기고 hook env 없이 startup을 계속한다. 지연 listen/실패 helper 2 tests, fresh/restored PTY env 2 tests, app typecheck, root check, 변경 경로 ESLint/Prettier 통과. 앱 실제 Electron startup은 실행하지 않았다.
- T-032 preload의 `contentApi`·`systemApi`에 기존 `WorkspaceApi` 중 해당하는 부분 타입을 적용했다. `unknown` 구현 반환·인자를 제거해 Workspace/fs/search/model/CAD/EPUB/usage 계약이 declaration과 어긋나면 typecheck에서 검출된다. IPC payload runtime validation은 추가하지 않았다. app typecheck, root check, 변경 경로 ESLint/Prettier 통과.
- T-033 Main `readFileBinaryPreview`가 workspace root confinement와 MIME/로그/`null` 동작을 유지하면서 파일 bytes를 `fs.promises.readFile`로 읽도록 변경했다. 7개 focused tests에서 async payload와 pending read 중 `setImmediate` 진행을 확인했다. app typecheck, root check 통과. `files.ts` ESLint의 함수 반환형 오류 1개와 `workspace.ts`의 반환형 오류 2개는 변경 전 HEAD에도 동일하게 있어 유지했다. Base64 변환/IPC copy 및 Electron runtime latency는 측정하지 않았다.
