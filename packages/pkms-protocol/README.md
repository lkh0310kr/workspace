# PKMS protocol

This package holds the TypeScript HTTP DTOs and Realtime contracts shared by the PKMS server and clients.

- `src/types.ts` defines the shared TypeScript HTTP DTOs and Realtime models. HTTP requests and responses are implemented by the server route handlers and client transports; these DTOs are maintained directly.
- `realtime.schema.json` describes Realtime message envelopes and payloads.
- The iOS HTTP and Realtime DTOs are maintained in [PKMSProtocolModels.swift](../../apps/pkms-ios/PKMSProtocolModels.swift).

Treat changes to fields, CRDT encoding, path semantics, or conflict behavior as protocol changes. Update the affected DTOs and Realtime schema with the implementation, and record service behavior in [PKMS architecture](../../docs/architecture/pkms/overview.md) and [folder sync](../../docs/architecture/pkms/folder-sync.md).

Run `npm run check:realtime-models --workspace @pkms/protocol` after Realtime contract or model changes. The checker compares TypeScript Realtime envelope fields/discriminators and the iOS peer, hello, document-update, and operation-result payloads with `realtime.schema.json`. It does not validate HTTP routes or HTTP DTO compatibility.

Read the [package contract](../../docs/architecture/pkms/protocol/README.md) for model ownership, encoding, compatibility boundaries, and the exact scope of the checker.
