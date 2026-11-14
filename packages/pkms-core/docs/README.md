# Rust Core와 binding 계약

Package scope는 VaultPath·operation envelope·Yrs MarkdownDoc와 native/WASM binding이다. HTTP·Supabase·GitHub·React·SwiftUI·자격 증명은 owner가 아니다. 근거는 [core](../crates/pkms-core/src/lib.rs), [ffi](../crates/pkms-ffi/src/lib.rs), [wasm](../crates/pkms-wasm/src/lib.rs)다.

## 경로와 operation

VaultPath는 workspace-relative case-sensitive 경로다. parse는 빈 값·앞 / 또는 ~를 AbsolutePath로, backslash·빈/dot/parent component를 InvalidPathComponent로, component의 control char를 ControlCharacter로 거부한다. parent는 마지막 slash 앞 경로 또는 None, file_name은 마지막 component다. Rust 규칙을 OS 절대 파일 path 허용 정책과 혼동하지 않는다.

FileOperation은 serde tagged `type`, kebab-case(create-folder/create-file/move/delete)다. OperationEnvelope는 protocol_version/operation_id/base_revision/operation이며 version=1과 비어 있지 않은 operation_id를 validate한다. UUID 형식/HTTP clientId/remote revision concurrency를 core.validate가 자동 검증하는 것은 아니다. wire DTO의 field casing과 shape는 별도 protocol package 계약이다.

## MarkdownDoc

PROTOCOL_VERSION=1, TEXT_ROOT=markdown, Doc Options OffsetKind=Utf16이다. client ID로 생성하고 from_updates는 Yjs v1 update들을 순서대로 적용한다. malformed update 또는 apply 실패는 InvalidDocumentUpdate다.

| API                        | 입력·출력                                                                    |
| -------------------------- | ---------------------------------------------------------------------------- |
| text                       | Y.Text markdown의 plain text                                                 |
| insert(index_utf16,value)  | index<=text length 확인 후 insert, transaction의 v1 incremental update bytes |
| delete(index,length_utf16) | saturating_add로 범위 확인 후 remove, incremental update bytes               |
| apply_update(bytes)        | v1 decode/apply 후 전체 현재 text                                            |
| state_vector               | v1 encoded state vector                                                      |
| encode_state(vector)       | 주어진 v1 state vector 이후의 state update                                   |
| snapshot                   | empty vector 기준 full state update                                          |

String UTF-8 byte length와 UTF-16 offset을 구분한다. surrogate 경계·invalid update·동시 merge의 전체 재현 fixture는 별도 검증해야 한다. current API가 app-level revision/dirty/save를 소유하지는 않는다.

## C ABI와 UniFFI

pkms-ffi는 Mutex<MarkdownDoc>를 가진 SharedMarkdownDoc를 C ABI와 UniFFI 두 표면으로 제공한다. 현재 iOS는 [NativeMarkdownDocument](../../../apps/pkms-ios/NativeMarkdownDocument.swift)에서 C 함수를 직접 쓴다. UniFFI 선언이 존재해도 generated Swift API가 현재 앱 연결이라고 서술하지 않는다.

C pkms_doc_new는 raw owned handle, pkms_doc_free는 한 번만 해제한다. text/snapshot/state_vector/insert/delete 반환 PkmsByteBuffer(data,len)는 Rust가 할당하며 소비자가 복사한 뒤 pkms_buffer_free(data,len)로 한 번 해제한다. 길이 0의 입력은 null pointer도 빈 slice로 인정하고, 양수 길이+null은 실패다. apply_update는 0/−1, insert/delete 실패는 빈 buffer를 반환한다. 따라서 실패와 빈 결과를 모든 함수에서 rich Error로 구분할 수 있다고 가정하지 않는다. handle 이중 free·유효하지 않은 non-null pointer는 caller가 막아야 한다.

UniFFI API는 Arc object와 FfiError(InvalidUpdate/InvalidRange)를 사용한다. C 수동 ownership과 같은 방식으로 해제하지 않는다. poisoned mutex의 expect 경로를 모든 호출에서 recoverable Result로 바꿔 설명하지 않는다.

## WASM·build·수락

WasmMarkdownDoc는 core를 감싸고 오류를 JsError로 변환한다. Web 앱이 현재 사용하는 TypeScript/Yjs와 이 binding source는 구분한다. binding 생성 가능 여부와 Web 런타임 채택은 별도다.

기본 compile 검증은 package directory의 `cargo check --workspace`다. iOS XCFramework는 [app build script](../../../apps/pkms-ios/scripts/build-rust-framework.sh)가 device/simulator staticlib와 C header를 묶는다. native target 설치·Xcode·서명·device 실행은 app scope 검증이다.

CORE-01 path 거부 사유·case 유지, CORE-02 한글/emoji UTF-16 round trip, CORE-03 invalid v1 update 오류, CORE-04 snapshot+state vector merge, CORE-05 C handle/buffer 단일 해제, CORE-06 binding별 오류 의미가 수락 기준이다. 기존 package에 독립 단위 test suite가 구성돼 있다고 주장하지 않는다. compile만으로 모든 CRDT/ABI·native acceptance를 통과한 것은 아니다.
