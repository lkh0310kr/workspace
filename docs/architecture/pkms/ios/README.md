# PKMS iOS app 계약

App scope는 SwiftUI 상태·native transport·Keychain·CRDT cache·Realtime와 build다. 도메인 CRDT/UTF-16와 C ABI는 [Rust package](../../../../packages/pkms-core/README.md), wire DTO는 [PKMS protocol](../../../../packages/pkms-protocol/README.md), 서비스 저장은 PKMS Server가 소유한다.

## 앱 상태와 계정

[PKMSCloudApp](../../../../apps/pkms-ios/PKMSCloudApp.swift)은 PKMSModel을 environment로 제공하고 task에서 restoreSession을 호출한다. [PKMSModel](../../../../apps/pkms-ios/PKMSModel.swift)은 @MainActor/@Observable이며 user/workspaces/files/active document·sidebar·loading/error·device flow·collaborators를 소유한다. ContentView가 이를 렌더링한다.

serverAddress는 UserDefaults의 pkms.serverAddress에 저장한다. init은 이전 localhost/127.0.0.1 주소를 production default로 대체하고 해당 origin으로 session을 읽는다. [SessionVault](../../../../apps/pkms-ios/SessionVault.swift)는 service+origin account의 generic-password Keychain 항목이다. 신규 항목은 AfterFirstUnlockThisDeviceOnly. origin preference와 bearer secret을 같은 UserDefaults에 보관하지 않는다.

restore는 token이 있을 때 /api/session을 읽고 user가 있으면 workspace를 로드한다. user가 없으면 signOut, network 오류는 errorMessage다. device sign-in은 중복 시작을 막고 deviceTask를 교체한다. poll은 최소 5초와 expires_in deadline, pending interval·network 오류·Task 취소를 구분한다. 성공 token은 Keychain에 저장한다. signOut은 Realtime·device·flush task와 계정/문서 상태를 정리한다.

## HTTP·문서·캐시

[PKMSAPITransport](../../../../apps/pkms-ios/PKMSAPITransport.swift)는 ephemeral URLSession, waitsForConnectivity, request/resource timeout 30/60초, reloadIgnoringLocalCacheData다. GET 및 device start/poll의 지정 URLError만 최대 2회 재시도하며 delay는 1초·2초다. 일반 mutation을 이 정책으로 무조건 재시도하지 않는다. HTTP non-2xx는 status와 X-Request-ID·server message를 사용하고 401을 별도 오류로 다룬다.

[NativeMarkdownDocument](../../../../apps/pkms-ios/NativeMarkdownDocument.swift)는 C handle을 소유하고 deinit에서 pkms_doc_free한다. 반환 PkmsByteBuffer는 Data로 복사한 뒤 pkms_buffer_free한다. insert/delete offset은 UTF-16, byte buffer는 UTF-8 또는 Yjs v1 encoding이며 같은 단위가 아니다.

문서 cache는 400ms 예약 후 snapshot을 저장한다. 최근 workspace/file key를 UserDefaults에 보관하고 최근 20개 밖의 cache 파일을 제거한다. cache와 실제 server save/Realtime acknowledgement를 구분한다. 파일 선택/operation은 [PKMSWorkspaceOperations](../../../../apps/pkms-ios/PKMSWorkspaceOperations.swift)가 구현한다.

## Realtime·cleanup

[PKMSRealtimeSession](../../../../apps/pkms-ios/PKMSRealtimeSession.swift)은 Supabase private channel·presence·document messages와 token refresh task를 소유한다. connect task·channel subscription·refresh task는 disconnect에서 취소/해제하며 다시 연결한 document/workspace identity를 확인해야 한다. native editor가 문서 bytes를 수정하는 것과 Realtime 상태·HTTP durable save는 별개 흐름이다.

## Build·수락

[build script](../../../../apps/pkms-ios/scripts/build-rust-framework.sh)는 pkms-ffi를 iOS device/Apple Silicon simulator 대상으로 빌드하고 Native/include의 C headers로 XCFramework를 만든다. 실제 Swift 경로는 generated UniFFI Swift API 대신 이 C header를 사용한다. 앱 실행·설정은 [README](../README.md)를 따른다.

IOS-01 origin별 token 분리, IOS-02 device flow 취소/만료, IOS-03 cache eviction과 재열기, IOS-04 한글/emoji UTF-16 edit round trip, IOS-05 network retry 중 mutation 중복 방지, IOS-06 Realtime 재접속과 원격 편집 적용이 수락 기준이다. wire model check는 일부 Realtime field만 검증한다. 실제 Xcode build·simulator/device·Keychain/offline acceptance는 이번 문서 작업에서 실행하지 않았다.
