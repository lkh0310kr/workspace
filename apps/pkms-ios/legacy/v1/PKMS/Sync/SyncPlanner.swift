import CryptoKit
import Foundation

/// Git's content hash for a file: SHA-1 of `"blob <size>\0" + contents`.
/// Matching GitHub's blob SHAs lets sync compare files without downloading them.
enum GitBlobHash {
    static func of(_ data: Data) -> String {
        var hasher = Insecure.SHA1()
        hasher.update(data: Data("blob \(data.count)\0".utf8))
        hasher.update(data: data)
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

/// What to do with one path when bringing in changes from GitHub.
enum SyncAction: Equatable, Sendable {
    /// Local and remote already match.
    case none
    case download(sha: String)
    case deleteLocal
    /// Changed only on this device; it will be uploaded.
    case upload
    /// Edited here but deleted on GitHub: the edit wins and the file is uploaded again.
    case restoreLocal
    /// Changed on both sides; try a text merge, otherwise keep both versions.
    case merge(remoteSHA: String)
}

/// Three-way comparison of blob hashes: `base` (last sync), `local` (on disk now) and `remote` (GitHub now).
/// Pure logic, so the rules are easy to test. Edits are never discarded: edit-vs-delete keeps the edit.
enum SyncPlanner {
    static func action(base: String?, local: String?, remote: String?) -> SyncAction {
        if local == remote { return .none }
        if local == base { return remote.map { .download(sha: $0) } ?? .deleteLocal }
        if remote == base { return .upload }
        // Changed on both sides.
        guard let remote else { return .restoreLocal }
        guard local != nil else { return .download(sha: remote) }
        return .merge(remoteSHA: remote)
    }

    static func plan(base: [VaultPath: String], local: [VaultPath: String], remote: [VaultPath: String]) -> [VaultPath: SyncAction] {
        let paths = Set(base.keys).union(remote.keys)
        return Dictionary(uniqueKeysWithValues: paths.map {
            ($0, action(base: base[$0], local: local[$0], remote: remote[$0]))
        })
    }
}
