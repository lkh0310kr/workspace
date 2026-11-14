# Rust workspace

`pkms-core`는 Yrs로 path 검증, file operation envelope, Yjs 호환 Markdown CRDT state를 구현한다. Text offset은 JavaScript editor API와 맞도록 UTF-16을 사용한다.

- `pkms-wasm`은 wasm-bindgen binding을 제공한다. 현재 Web editor는 TypeScript/Yjs 경로를 사용한다. Binding이 있다는 사실만으로 runtime에서 채택됐다고 판단하지 않는다.
- `pkms-ffi`는 C ABI와 UniFFI surface를 제공한다. 현재 Swift app은 native header를 통해 C ABI를 호출하며 XCFramework는 로컬 build artifact다.

Wire 계약은 `../pkms-protocol`에 있다. `pkms-core`에 transport, GitHub API, Cloudflare, React, SwiftUI 의존성을 추가하지 않는다.

Platform binding을 생성하려면 다음 명령을 실행한다.

```sh
wasm-pack build crates/pkms-wasm --target web --out-dir ../../apps/pkms-web/app/generated/pkms-wasm
```

저장소 root에서 `bash apps/pkms-ios/scripts/build-rust-framework.sh`를 실행하면 device와 Apple Silicon simulator용 XCFramework를 만든다.

Path 규칙, UTF-16 편집, CRDT encoding, buffer 소유권, binding별 오류는 [구현 계약](../../docs/architecture/pkms/core/README.md)을 읽는다.
