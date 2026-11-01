# PKMS

A GitHub backed, local-first personal knowledge system with a shared protocol for the web and iOS clients.

## Repository layout

```text
apps/
  web/       React Router web client and Cloudflare Worker
  ios/       New SwiftUI client
protocol/    Language-neutral HTTP and realtime contract
crates/      Shared Rust domain and CRDT implementation
legacy/      Archived v1 SwiftUI client
docs/        Product and architecture decisions
```

## Development

The web project targets Cloudflare Workers and Durable Objects. See [apps/web/README.md](apps/web/README.md) for local setup and required secrets.

The Rust workspace contains the shared protocol domain and client bindings. See [crates/README.md](crates/README.md).

The previous SwiftUI app is preserved under [legacy/ios-v1](legacy/ios-v1). New development belongs in `apps/ios` and should use the shared protocol.

## Design

- [Cloud protocol design](docs/pkms-cloud-protocol-design.md)
- [Project structure](docs/project-structure.md)
- [Protocol contract](protocol/openapi.yaml)
