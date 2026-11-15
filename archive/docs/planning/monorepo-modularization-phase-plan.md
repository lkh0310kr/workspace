# Monorepo 모듈화 단계 계획

## 목표와 종료 조건

UI 조립, 기능 상태, IPC adapter, service route, wire 계약을 분리해 PKMS 통합부와 Workspace 앱 진입점을 쉽게 변경할 수 있도록 합니다. 아래 범위에 든 모든 진입점이 조립 계층이 되고 기능 동작이 이름 있는 모듈에 들어가면 종료합니다. 저장소의 모든 대형 파일을 다시 쓰는 작업으로 범위를 넓히지 않습니다.

5개 단계가 모두 종료 기준을 만족하면 범위가 완료됩니다. 새 제품 기능이나 무관한 정리는 범위를 늘리지 않습니다.

## Scope

### 범위에 포함

- PKMS shared client: `packages/pkms-client/src/PkmsClientApp.tsx` and its account, repository, file browser, editor, and sync modules.
- Workspace PKMS integration and desktop shell boundaries: `apps/workspace/src/main/index.ts`, `apps/workspace/src/main/ipc/`, and `apps/workspace/src/preload/index.ts`.
- PKMS Cloudflare service: `apps/web/workers/app.ts`, `apps/web/workers/SupabaseVault.ts`, and related auth, MCP, persistence, and scheduled-sync modules.
- iOS PKMS coordination: `apps/ios/PKMSModel.swift`, `apps/ios/PKMSProtocolModels.swift`, and native FFI use.
- Shared PKMS contracts and Rust core boundaries: `packages/pkms-protocol/` and `packages/pkms-core/`.
- Architecture documentation for these boundaries.

### 범위에서 제외

- Reorganizing every Workspace renderer pane or unrelated systems such as browser, terminal internals, CAD, World Engine, and hardware simulation.
- Rewriting `apps/ios/legacy/v1/` or vendored dependencies.
- UI redesign, new product behavior, API or Realtime wire changes, database migrations, backend replacement, deployment changes, and expanding the Rust core into networking or UI responsibilities.
- Mechanical file splitting done only to meet a line-count target.

## 단계 계획

| 단계 | 작업 | 종료 기준 | 상태 |
|---|---|---|---|
| 0. Boundaries | Record app/package ownership and dependency direction. | Architecture map and explicit in/out-of-scope list are checked in. | Complete |
| 1. Shared PKMS client | Separate account/session, file browser, editor/document, and sync features. Keep Web and Desktop mounting the same public client entry. | `PkmsClientApp` composes feature hooks and views; file browse, mutations, editor lifecycle, offline cache, realtime messages, and sync feedback live in named modules. Web/Desktop typecheck and Web build pass. | Complete |
| 2. Workspace shell | Move Main IPC handlers into capability registrars; split preload API definitions by namespace and retain a small composition entry. | `main/index.ts` owns lifecycle and composition; IPC capabilities are registered in named modules; preload exposes the same namespaces and channel names. Workspace typecheck passes. | Complete |
| 3. Cloud service | Split Worker request dispatch from auth, workspace API, MCP, and scheduled flush behavior. Keep vault persistence and GitHub flush semantics in their existing service boundary where they share helpers. | `app.ts` dispatches and composes route modules; service modules own auth, workspace routes, MCP, persistence, and scheduled flush behavior. Status codes, auth scopes, Supabase calls, GitHub flush semantics, and scheduled trigger remain unchanged. Web typecheck/build pass. | Complete |
| 4. iOS client | Split `PKMSModel` coordination into API/session, workspace/file operations, and document/Realtime modules. Keep SwiftUI state names and Rust FFI contract stable. | `PKMSModel` coordinates the extracted transport and feature extensions; simulator build passes. | Complete |
| 5. Contract closeout | Make OpenAPI and Realtime JSON Schema the contract authority; mechanically validate TypeScript and Swift wire models. Reconcile docs and verify all in-scope apps. | All 13 OpenAPI component schemas and the shared Realtime envelope fields/discriminators are checked against their TypeScript/iOS models; Workspace typecheck, Web typecheck/build, and iOS simulator build pass. | Complete |

## 완료한 작업

- `packages/pkms-client/src/domain/` contains file tree, path, filter, encoding, and Yjs text helpers; `client/` contains API and revisioned operation transport.
- `components/FileTreeList.tsx` renders and delegates tree interactions; `features/files/useFileTreeSelection.ts` owns focus and selection state.
- `features/files/useWorkspaceDirectory.ts` owns folder loading, directory restoration, and directory tree state.
- `apps/workspace/src/main/ipc/` has terminal and workspace/filesystem/search registrars.
- Workspace Main capabilities for system, content, agent status, and terminal quit buffers are also registered in named IPC modules; preload definitions are grouped into system, browser, terminal, and content API files.
- `packages/pkms-protocol/src/types.ts` is shared by the Worker and React client; Realtime presence data is checked against that contract.
- `packages/pkms-client/src/features/` owns account session, file creation/mutations, document lifecycle, realtime message handling, directory state, tree selection, and document sync.
- Cloudflare auth and workspace routes are separate from the Worker request dispatcher; MCP and scheduled vault flush remain named service boundaries.
- iOS API transport, workspace operations, and Realtime session coordination are separated from the SwiftUI-facing model.
- `apps/ios/PKMSProtocolModels.swift` contains iOS HTTP and Realtime DTOs; `packages/pkms-protocol/scripts/check-wire-models.mjs` checks contract field and required-field parity.

## 호환성 규칙

- 모듈 이동 중 기존 HTTP 경로·메서드·요청/응답 형태·Realtime 메시지·IPC 채널·데이터베이스 스키마·Worker binding·FFI signature를 그대로 보존합니다.
- 비밀 값과 권한 작업은 현재 소유 runtime(Electron Main, Cloudflare Worker, iOS secure storage)에 둡니다.
- 의존성은 앱에서 패키지 방향으로 둡니다. 패키지에서 앱 코드를 import하지 않습니다.
- 기능 또는 단계가 끝날 때마다 변경 범위를 좁힌 커밋을 하나 만듭니다. 무관한 작업 트리 변경은 보존합니다.

## 검증

해당 단계 경계에서 다음 build/type 검사를 실행합니다.

```bash
npm run web:typecheck
npm run web:build
npm run check:app
npm run check:wire-models --workspace @pkms/protocol
xcodebuild -project apps/ios/PKMS.xcodeproj -scheme PKMS -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

`packages/pkms-core/`가 바뀐 경우에만 Rust 검사를 실행합니다. 이 단계 계획에서는 테스트를 추가하거나 실행하지 않습니다.

## 완료

5개 단계가 모두 종료 기준을 만족합니다. 배포·데이터베이스·API·Realtime·Rust core 동작은 바꾸지 않았습니다. 기존 `docs/planning/backlog.md` 변경은 보존했습니다.
