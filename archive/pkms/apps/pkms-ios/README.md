# iOS용 PKMS Cloud

현재 앱의 경계·상태·계약은 [app scope 문서](../../docs/architecture/pkms/ios/README.md)를 기준으로 합니다.

Native SwiftUI client는 C FFI를 통해 Rust/Yrs 문서 구현을 사용한다. 생성된 XCFramework는 로컬에만 두며 Git에서 무시한다.

## 빌드

저장소 root에서 실행한다.

```sh
bash apps/pkms-ios/scripts/build-rust-framework.sh
open apps/pkms-ios/PKMS.xcodeproj
```

Rust build script가 rustup으로 iOS device와 Apple Silicon simulator target을 설치한다. `PKMS` scheme을 열어 iOS 17 이상 simulator 또는 device에서 실행한다. GitHub Device Flow로 로그인한다. Settings에서 server URL을 지정하며 배포 server에는 HTTPS를 사용한다.

앱은 session token을 Keychain에 저장하고 최근 20개 clean Markdown CRDT snapshot과 모든 cloud ACK 대기 중인 dirty snapshot을 Application Support에 cache한다. 편집 snapshot은 각 변경 뒤 atomic write하며 같은 문서의 cloud updates는 순서대로 전송한다. 최신 변경의 ACK 전에는 dirty cache를 정리하지 않는다. Workspace를 열면 cache를 먼저 표시하고 서버 listing으로 갱신한다. 한 directory를 열면 그 immediate child folders의 listing도 background-prefetch한다. Worker에 설정한 GitHub OAuth App은 Device Flow가 활성화돼 있어야 한다.
