import Foundation

/// Access to the vault's files. The UI and view models depend only on this protocol,
/// never on `FileManager`, so the storage strategy can change underneath them.
///
/// The sync engine works on the same local directory and never goes through this protocol;
/// after a sync the app just reloads the index.
protocol VaultRepository: Sendable {
    /// Scans the vault and builds a fresh index.
    func loadIndex() async throws -> FileIndex
    /// Reads a text file (a Markdown document).
    func readText(at path: VaultPath) async throws -> String
    /// Reads raw bytes (an image or other asset).
    func readData(at path: VaultPath) async throws -> Data

    /// Atomically replaces (or creates) a text file, creating parent folders as needed.
    func writeText(_ text: String, to path: VaultPath) throws
    func createFolder(at path: VaultPath) throws
    /// Renames or moves a file or folder. Fails if `destination` already exists.
    func move(_ path: VaultPath, to destination: VaultPath) throws
    func delete(_ path: VaultPath) throws
    func exists(_ path: VaultPath) -> Bool
}

enum VaultError: LocalizedError, Equatable {
    case unreadableText(VaultPath)
    case alreadyExists(VaultPath)
    case cannotMoveIntoItself

    var errorDescription: String? {
        switch self {
        case .unreadableText(let path): "“\(path.name)” is not a UTF-8 text file."
        case .alreadyExists(let path): "“\(path.name)” already exists."
        case .cannotMoveIntoItself: "A folder can’t be moved into itself."
        }
    }
}

/// A vault stored as a plain directory of Markdown files on this device.
struct LocalVaultRepository: VaultRepository {
    let rootURL: URL

    /// Names never shown in or indexed from the vault. `.git` matters once the vault is a clone.
    static let ignoredNames: Set<String> = [".git", ".obsidian", ".trash", ".DS_Store"]

    func loadIndex() async throws -> FileIndex {
        FileIndex(root: try scanFolder(at: rootURL, path: .root))
    }

    func readText(at path: VaultPath) async throws -> String {
        let data = try await readData(at: path)
        guard let text = String(data: data, encoding: .utf8) else { throw VaultError.unreadableText(path) }
        return text
    }

    func readData(at path: VaultPath) async throws -> Data {
        try Data(contentsOf: url(for: path), options: .mappedIfSafe)
    }

    func writeText(_ text: String, to path: VaultPath) throws {
        let url = url(for: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url, options: .atomic)
    }

    func createFolder(at path: VaultPath) throws {
        try FileManager.default.createDirectory(at: url(for: path), withIntermediateDirectories: true)
    }

    func move(_ path: VaultPath, to destination: VaultPath) throws {
        guard path != destination else { return }
        // Allow case-only renames ("note" → "Note") on case-insensitive file systems.
        if exists(destination), path.string.lowercased() != destination.string.lowercased() {
            throw VaultError.alreadyExists(destination)
        }
        let target = url(for: destination)
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: url(for: path), to: target)
    }

    func delete(_ path: VaultPath) throws {
        try FileManager.default.removeItem(at: url(for: path))
    }

    func exists(_ path: VaultPath) -> Bool {
        FileManager.default.fileExists(atPath: url(for: path).path(percentEncoded: false))
    }

    func url(for path: VaultPath) -> URL {
        path.components.reduce(rootURL) { $0.appending(path: $1, directoryHint: .inferFromPath) }
    }

    private func scanFolder(at url: URL, path: VaultPath) throws -> VaultNode {
        let entries = try FileManager.default.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        )
        var children: [VaultNode] = []
        for entry in entries where !Self.ignoredNames.contains(entry.lastPathComponent) {
            let childPath = path.appending(entry.lastPathComponent)
            if try entry.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true {
                if childPath.isMap {
                    children.append(VaultNode(path: childPath, kind: .map))
                    continue
                }
                children.append(try scanFolder(at: entry, path: childPath))
            } else {
                children.append(VaultNode(path: childPath, kind: childPath.isMarkdown ? .markdown : .asset))
            }
        }
        children.sort { lhs, rhs in
            if lhs.isFolder != rhs.isFolder { return lhs.isFolder }
            return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        }
        return VaultNode(path: path, kind: .folder, children: children)
    }
}

extension LocalVaultRepository {
    /// `Application Support/vault`.
    static var defaultRootURL: URL {
        URL.applicationSupportDirectory.appending(path: "vault", directoryHint: .isDirectory)
    }

    /// Creates the vault directory on first launch, seeding it with the bundled sample vault
    /// so there is something to browse. Existing vaults are never touched.
    static func prepareDefault() throws -> LocalVaultRepository {
        let root = defaultRootURL
        let fm = FileManager.default
        if !fm.fileExists(atPath: root.path(percentEncoded: false)) {
            try fm.createDirectory(at: root.deletingLastPathComponent(), withIntermediateDirectories: true)
            if let sample = Bundle.main.url(forResource: "SampleVault", withExtension: nil) {
                try fm.copyItem(at: sample, to: root)
            } else {
                try fm.createDirectory(at: root, withIntermediateDirectories: true)
            }
        }
        return LocalVaultRepository(rootURL: root)
    }
}
