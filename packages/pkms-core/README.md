# Rust workspace

`pkms-core` implements path validation, file operation envelopes, and Yjs-compatible Markdown CRDT state using Yrs. Text offsets are UTF-16 so they match JavaScript editor APIs.

- `pkms-wasm` exposes the core to web clients through wasm-bindgen.
- `pkms-ffi` exposes the same core to Swift through UniFFI; the generated XCFramework and Swift source are build artifacts, not committed binaries.

The wire contract is in `../pkms-protocol`. Do not add transport, GitHub API, Cloudflare, React, or SwiftUI dependencies to `pkms-core`.

To create platform bindings:

```sh
wasm-pack build crates/pkms-wasm --target web --out-dir ../../apps/pkms-web/app/generated/pkms-wasm
```

From the repository root, `bash apps/pkms-ios/scripts/build-rust-framework.sh` produces an XCFramework for device and Apple Silicon simulator targets.
