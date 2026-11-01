# PKMS

A GitHub backed, local-first personal knowledge system with a shared protocol for the web and iOS clients.

## Repository layout

```text
apps/
  workspace/ Electron desktop shell with the PKMS pane
  web/       React Router client and Cloudflare Worker
  ios/       SwiftUI client and archived v1 source
packages/
  pkms-client/ Shared React client UI for Web and Workspace
  pkms-core/   Rust domain, CRDT, WASM, and FFI crates
  pkms-protocol/ Language-neutral HTTP and realtime contract
docs/pkms/     Product and architecture decisions
```

## Development

The web project targets Cloudflare Workers. From the repository root, run `npm install`; see [apps/web/README.md](../../apps/web/README.md) for local setup and required secrets.

The Rust workspace contains the shared protocol domain and client bindings. See [packages/pkms-core/README.md](../../packages/pkms-core/README.md).

The previous SwiftUI app is preserved under [apps/ios/legacy/v1](../../apps/ios/legacy/v1). New development belongs in `apps/ios` and should use the shared protocol.

## Design

- [Cloud protocol design](pkms-cloud-protocol-design.md)
- [Project structure](project-structure.md)
- [Protocol contract](../../packages/pkms-protocol/openapi.yaml)
