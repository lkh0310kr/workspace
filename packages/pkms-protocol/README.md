# PKMS protocol

This package holds the language-neutral HTTP and Realtime contract shared by the Cloudflare Worker and clients.

- `openapi.yaml` describes the HTTP API.
- `realtime.schema.json` describes realtime message envelopes.

Treat changes to fields, CRDT encoding, path semantics, or conflict behavior as protocol changes and document compatibility implications in `docs/pkms/pkms-cloud-protocol-design.md`.

Run `npm run check:wire-models --workspace @pkms/protocol` after contract or DTO changes. The checker compares all OpenAPI component schema fields and required fields with the shared TypeScript and iOS models. It also checks the TypeScript Realtime message envelope fields/discriminators and the iOS peer, hello, document-update, and operation-result payloads against `realtime.schema.json`.
