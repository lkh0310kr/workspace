# PKMS Cloud for iOS

현재 앱의 경계·상태·계약은 [app scope 문서](./docs/README.md)를 기준으로 합니다.

The native SwiftUI client uses the Rust/Yrs document implementation through a C FFI. The generated XCFramework stays local and is ignored by Git.

## Build

From the repository root:

```sh
bash apps/pkms-ios/scripts/build-rust-framework.sh
open apps/pkms-ios/PKMS.xcodeproj
```

The Rust build script installs the iOS device and Apple Silicon simulator targets with rustup. Open the `PKMS` scheme and run it on an iOS 17 or newer simulator or device. Sign in using GitHub Device Flow. Set the server URL in Settings; use HTTPS for a deployed server.

The app stores the session token in Keychain and caches CRDT state for the 20 most recently opened Markdown files. The GitHub OAuth App configured for the Worker must have Device Flow enabled.
