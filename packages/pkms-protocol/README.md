# PKMS protocol

This package holds the language-neutral HTTP and Realtime contract shared by the Cloudflare Worker and clients.

- `openapi.yaml` describes the HTTP API.
- `realtime.schema.json` describes realtime message envelopes.

Treat changes to fields, CRDT encoding, path semantics, or conflict behavior as protocol changes and document compatibility implications in `docs/pkms/pkms-cloud-protocol-design.md`.
