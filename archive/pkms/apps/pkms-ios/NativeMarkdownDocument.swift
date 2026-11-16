import Foundation
import PkmsNativeFFI

/// Swift ownership wrapper for the shared Rust/Yrs Markdown document.
final class NativeMarkdownDocument {
    private let handle: OpaquePointer

    init(clientID: UInt64 = UInt64.random(in: 1...9_007_199_254_740_991)) {
        handle = pkms_doc_new(clientID)
    }

    deinit { pkms_doc_free(handle) }

    var text: String {
        let value = copy(pkms_doc_text(handle))
        return String(decoding: value, as: UTF8.self)
    }

    var snapshot: Data { copy(pkms_doc_snapshot(handle)) }
    var stateVector: Data { copy(pkms_doc_state_vector(handle)) }

    @discardableResult
    func apply(_ update: Data) -> Bool {
        update.withUnsafeBytes { bytes in
            pkms_doc_apply_update(handle, bytes.bindMemory(to: UInt8.self).baseAddress, update.count) == 0
        }
    }

    func insert(utf16Index: UInt32, text: String) -> Data {
        let data = Data(text.utf8)
        let buffer = data.withUnsafeBytes { bytes in
            pkms_doc_insert(handle, utf16Index, bytes.bindMemory(to: UInt8.self).baseAddress, data.count)
        }
        return copy(buffer)
    }

    func delete(utf16Index: UInt32, length: UInt32) -> Data {
        copy(pkms_doc_delete(handle, utf16Index, length))
    }

    private func copy(_ buffer: PkmsByteBuffer) -> Data {
        defer { pkms_buffer_free(buffer.data, buffer.len) }
        guard let bytes = buffer.data, buffer.len > 0 else { return Data() }
        return Data(bytes: bytes, count: buffer.len)
    }
}
