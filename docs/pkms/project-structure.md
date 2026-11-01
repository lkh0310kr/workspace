# Project structure

## Purpose

PKMS is integrated into the Workspace monorepo. Desktop, Web, and iOS are applications under `apps/`; reusable client UI, protocol schemas, and Rust core live under `packages/`.

## Package boundaries

| Path | Responsibility | Runtime |
|---|---|---|
| `apps/workspace` | Electron desktop shell and PKMS pane | TypeScript / React |
| `apps/web` | React Router app and Cloudflare Worker API | TypeScript / Cloudflare Workers |
| `apps/ios` | Native SwiftUI UI, platform adapters, and archived v1 source | Swift |
| `packages/pkms-client` | Shared React client UI, editor, and Realtime client | TypeScript / React |
| `packages/pkms-protocol` | Versioned HTTP and realtime wire contract | Language neutral |
| `packages/pkms-core/crates/pkms-core` | Path rules, file operations, CRDT document/update behavior | Rust |
| `packages/pkms-core/crates/pkms-wasm` | WebAssembly exports for the browser | Rust + wasm-bindgen |
| `packages/pkms-core/crates/pkms-ffi` | Swift bindings for the iOS app | Rust + UniFFI |
| `apps/ios/legacy/v1` | Archived v1 app, tests, and runtime assets | Swift |

The protocol is the compatibility boundary. Rust is used for shared deterministic behavior; it is not the wire-format authority. HTTP schemas and event envelopes remain language neutral so clients can interoperate without requiring a Rust runtime.

## Deployment shape

The initial personal deployment keeps the app, API, room WebSockets, and scheduled GitHub flushes on Cloudflare Workers. Durable Objects provide per-workspace ordering and SQLite-backed persistence. No separate Redis, PostgreSQL, or always-on worker is required at the start.

```text
React Router app / Worker
  ├── HTTPS API and GitHub OAuth
  ├── Durable Object room (WebSocket + SQLite + alarm)
  └── GitHub REST API (batched commits, max 15 minute target)
```

Use WebSocket hibernation for idle rooms. Put large attachments in R2 only when needed; keep a documented size limit for ordinary Git blobs.

## Dependency direction

```text
protocol contract ──> web client / Worker / Swift client
                         │
                         └── Rust core adapters (WASM and UniFFI)
```

The Rust core must not depend on React, SwiftUI, Cloudflare, GitHub, or a specific transport. Platform adapters own networking, authentication, local cache policy, and UI state.

## Change policy

- Keep deployable clients under `apps/` and shared contracts/libraries under `packages/`.
- Commit each independently reviewable task separately.
- Treat changes to wire fields, CRDT encoding, path semantics, or conflict behavior as protocol changes and document compatibility/migration behavior.
