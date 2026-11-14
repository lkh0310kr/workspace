# Rust workspace

`pkms-core` implements path validation, file operation envelopes, and Yjs-compatible Markdown CRDT state using Yrs. Text offsets are UTF-16 so they match JavaScript editor APIs.

- `pkms-wasm` provides wasm-bindgen bindings; the current Web editor uses its TypeScript/Yjs path. Binding availability does not establish runtime adoption.
- `pkms-ffi` provides C ABI and UniFFI surfaces. The current Swift app calls the C ABI through native headers; its XCFramework is a local build artifact.

The wire contract is in `../pkms-protocol`. Do not add transport, GitHub API, Cloudflare, React, or SwiftUI dependencies to `pkms-core`.

To create platform bindings:

```sh
wasm-pack build crates/pkms-wasm --target web --out-dir ../../apps/pkms-web/app/generated/pkms-wasm
```

From the repository root, `bash apps/pkms-ios/scripts/build-rust-framework.sh` produces an XCFramework for device and Apple Silicon simulator targets.

Read the [package contracts](../../docs/architecture/pkms/core/README.md) for path rules, UTF-16 edits, CRDT encoding, buffer ownership, and binding-specific errors.
