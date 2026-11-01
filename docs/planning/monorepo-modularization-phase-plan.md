# Monorepo modularization phase plan

## Goal and stopping point

Make the PKMS integration and the Workspace application entry points easier to change by separating UI composition, feature state, IPC adapters, service routes, and wire contracts. Stop when every in-scope entry point below is a composition layer and its feature behavior lives in named modules. This plan does not expand into a repository-wide rewrite of every large file.

The scope is complete when all five phases meet their exit criteria. New product features and unrelated cleanup do not extend this scope.

## Scope

### In scope

- PKMS shared client: `packages/pkms-client/src/PkmsClientApp.tsx` and its account, repository, file browser, editor, and sync modules.
- Workspace PKMS integration and desktop shell boundaries: `apps/workspace/src/main/index.ts`, `apps/workspace/src/main/ipc/`, and `apps/workspace/src/preload/index.ts`.
- PKMS Cloudflare service: `apps/web/workers/app.ts`, `apps/web/workers/SupabaseVault.ts`, and related auth, MCP, persistence, and scheduled-sync modules.
- iOS PKMS coordination: `apps/ios/PKMSModel.swift`, `apps/ios/PKMSProtocolModels.swift`, and native FFI use.
- Shared PKMS contracts and Rust core boundaries: `packages/pkms-protocol/` and `packages/pkms-core/`.
- Architecture documentation for these boundaries.

### Out of scope

- Reorganizing every Workspace renderer pane or unrelated systems such as browser, terminal internals, CAD, World Engine, and hardware simulation.
- Rewriting `apps/ios/legacy/v1/` or vendored dependencies.
- UI redesign, new product behavior, API or Realtime wire changes, database migrations, backend replacement, deployment changes, and expanding the Rust core into networking or UI responsibilities.
- Mechanical file splitting done only to meet a line-count target.

## Phase plan

| Phase | Work | Exit criteria | Status |
|---|---|---|---|
| 0. Boundaries | Record app/package ownership and dependency direction. | Architecture map and explicit in/out-of-scope list are checked in. | Complete |
| 1. Shared PKMS client | Separate account/session, file browser, editor/document, and sync features. Keep Web and Desktop mounting the same public client entry. | `PkmsClientApp` composes feature hooks and views; file browse, mutations, editor lifecycle, offline cache, realtime messages, and sync feedback live in named modules. Web/Desktop typecheck and Web build pass. | Complete |
| 2. Workspace shell | Move Main IPC handlers into capability registrars; split preload API definitions by namespace and retain a small composition entry. | `main/index.ts` owns lifecycle and composition; IPC capabilities are registered in named modules; preload exposes the same namespaces and channel names. Workspace typecheck passes. | Complete |
| 3. Cloud service | Split Worker request dispatch from auth, workspace API, MCP, and scheduled flush behavior. Keep vault persistence and GitHub flush semantics in their existing service boundary where they share helpers. | `app.ts` dispatches and composes route modules; service modules own auth, workspace routes, MCP, persistence, and scheduled flush behavior. Status codes, auth scopes, Supabase calls, GitHub flush semantics, and scheduled trigger remain unchanged. Web typecheck/build pass. | Complete |
| 4. iOS client | Split `PKMSModel` coordination into API/session, workspace/file operations, and document/Realtime modules. Keep SwiftUI state names and Rust FFI contract stable. | `PKMSModel` coordinates the extracted transport and feature extensions; simulator build passes. | Complete |
| 5. Contract closeout | Make OpenAPI and Realtime JSON Schema the contract authority; mechanically validate TypeScript and Swift wire models. Reconcile docs and verify all in-scope apps. | All 13 OpenAPI component schemas and the shared Realtime envelope fields/discriminators are checked against their TypeScript/iOS models; Workspace typecheck, Web typecheck/build, and iOS simulator build pass. | Complete |

## Work already completed

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

## Compatibility rules

- Preserve every existing HTTP path, method, request/response shape, Realtime message, IPC channel, database schema, Worker binding, and FFI signature during module moves.
- Keep secrets and privileged operations in their current owning runtime: Electron Main, Cloudflare Worker, or iOS secure storage.
- Keep dependencies flowing from apps to packages. Packages must not import app code.
- Make one focused commit per completed feature or phase. Preserve unrelated working-tree edits.

## Verification

Run these build/type checks at the relevant phase boundary:

```bash
npm run web:typecheck
npm run web:build
npm run check:app
npm run check:wire-models --workspace @pkms/protocol
xcodebuild -project apps/ios/PKMS.xcodeproj -scheme PKMS -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

Run Rust checks only if `packages/pkms-core/` changes. This phase plan does not add or run tests.

## Completion

All five phases meet their exit criteria. No deployment, database, API, Realtime, or Rust core behavior was changed. The pre-existing `docs/planning/backlog.md` edit was preserved.
