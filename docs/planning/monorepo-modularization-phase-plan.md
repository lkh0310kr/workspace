# Monorepo modularization phase plan

## Goal and stopping point

Make the PKMS integration and the Workspace application entry points easier to change by separating UI composition, feature state, IPC adapters, service routes, and wire contracts. Stop when every in-scope entry point below is a composition layer and its feature behavior lives in named modules. This plan does not expand into a repository-wide rewrite of every large file.

Expected remaining work: **5 phases, roughly 8–12 focused commits**. Complete one phase at a time and update this plan's status. New product features and unrelated cleanup do not extend this scope.

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
| 1. Shared PKMS client | Finish separating `PkmsClientApp` into account/repository, file browser, editor/document, and sync features. Keep Web and Desktop mounting the same public client entry. | `PkmsClientApp` composes feature modules; file browse, editor, offline cache, realtime collaboration, and sync feedback remain in their owning modules. Web/Desktop typecheck and Web build pass. | In progress |
| 2. Workspace shell | Finish moving Main IPC handlers into capability registrars; split preload API definitions by namespace and retain a small preload composition entry. | `main/index.ts` owns lifecycle and composition; each IPC capability is registered in one module; preload exposes the same namespaces and channel names. Workspace typecheck passes. | In progress |
| 3. Cloud service | Split Worker request dispatch from auth, workspace API, MCP, and scheduled flush routes. Split `SupabaseVault` only where a capability has a stable input/output boundary. | `app.ts` is a dispatcher/composition layer; service modules own their route or job behavior; status codes, auth scopes, Supabase calls, GitHub flush semantics, and scheduled trigger remain unchanged. Web typecheck/build pass. | Not started |
| 4. iOS client | Split `PKMSModel` coordination into API/session, workspace/file operations, and document/Realtime modules. Keep SwiftUI state-facing API and the Rust FFI contract stable. | `PKMSModel` coordinates feature services without owning their transport details; simulator build passes. | Partially complete (DTOs moved) |
| 5. Contract closeout | Make OpenAPI and Realtime JSON Schema the contract authority; generate or mechanically validate TypeScript and Swift wire models. Reconcile docs and verify all in-scope apps. | No hand-maintained contract drift remains undetected; Workspace typecheck, Web typecheck/build, and iOS simulator build pass; this plan's in-scope checklist is complete. | Not started |

## Work already completed

- `packages/pkms-client/src/domain/` contains file tree, path, filter, encoding, and Yjs text helpers; `client/` contains API and revisioned operation transport.
- `components/FileTreeList.tsx` renders and delegates tree interactions; `features/files/useFileTreeSelection.ts` owns focus and selection state.
- `apps/workspace/src/main/ipc/` has terminal and workspace/filesystem/search registrars.
- `packages/pkms-protocol/src/types.ts` is shared by the Worker and React client; Realtime presence data is checked against that contract.
- `apps/ios/PKMSProtocolModels.swift` contains iOS HTTP and Realtime DTOs outside the app state model.

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
xcodebuild -project apps/ios/PKMS.xcodeproj -scheme PKMS -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

Run Rust checks only if `packages/pkms-core/` changes. This phase plan does not add or run tests.

## Current next action

Continue Phase 1 by extracting file browser directory loading/restoration and mutations from `PkmsClientApp.tsx` into `features/files/`. Then isolate editor document lifecycle and sync coordination before splitting the remaining account/repository UI.
