import Foundation

/// A remote copy of the vault. `GitHubRemote` is the real one; tests use an in-memory fake.
protocol RemoteVault: Sendable {
    func headCommit() async throws -> String
    /// Blob SHA of every file at `commit`, keyed by vault path.
    func files(at commit: String) async throws -> [VaultPath: String]
    func download(sha: String) async throws -> Data
    /// Commits `changes` (nil = delete) on top of `parent` and moves the branch to it.
    /// Throws `RemoteVaultError.outdated` if the branch no longer points at `parent`.
    func upload(_ changes: [VaultPath: Data?], parent: String, message: String) async throws -> String
}

enum RemoteVaultError: Error {
    case outdated
}

struct GitHubRemote: RemoteVault {
    let client: GitHubClient
    let repository: String
    let branch: String

    func headCommit() async throws -> String {
        try await client.headCommit(of: repository, branch: branch)
    }

    func files(at commit: String) async throws -> [VaultPath: String] {
        let tree = try await client.tree(of: repository, commit: commit)
        var files: [VaultPath: String] = [:]
        // Regular files only (no symlinks or submodules), skipping hidden paths like `.github/` or `.obsidian/`.
        for entry in tree.tree where entry.type == "blob" && ["100644", "100755"].contains(entry.mode) {
            let parts = entry.path.split(separator: "/", omittingEmptySubsequences: false)
            // The vault root's .aiignore is policy input for the on-device agent. Keep all
            // other hidden repository content private and out of the app's synced vault.
            let isRootAIIgnore = parts.count == 1 && parts[0] == ".aiignore"
            guard isRootAIIgnore || !parts.contains(where: { $0.isEmpty || $0.hasPrefix(".") }) else { continue }
            files[VaultPath(components: parts.map(String.init))] = entry.sha
        }
        return files
    }

    func download(sha: String) async throws -> Data {
        try await client.blob(of: repository, sha: sha)
    }

    func upload(_ changes: [VaultPath: Data?], parent: String, message: String) async throws -> String {
        var treeChanges: [GitHubClient.TreeChange] = []
        for (path, data) in changes.sorted(by: { $0.key < $1.key }) {
            let sha = try await data.asyncMap { try await client.createBlob(in: repository, content: $0) }
            treeChanges.append(.init(path: path.string, sha: sha))
        }
        let baseTree = try await client.treeSHA(of: repository, commit: parent)
        let tree = try await client.createTree(in: repository, base: baseTree, changes: treeChanges)
        let commit = try await client.createCommit(in: repository, message: message, tree: tree, parent: parent)
        do {
            try await client.updateBranch(in: repository, branch: branch, to: commit)
        } catch GitHubError.notFastForward {
            throw RemoteVaultError.outdated
        }
        return commit
    }
}

private extension Optional {
    func asyncMap<T>(_ transform: (Wrapped) async throws -> T) async rethrows -> T? {
        switch self {
        case .some(let value): try await transform(value)
        case .none: nil
        }
    }
}

/// What sync remembers between runs, stored outside the vault in `Application Support/Sync/state.json`.
struct SyncState: Codable, Sendable {
    /// `owner/name@branch` the state belongs to.
    var repository: String
    /// Last commit fully reflected in the vault.
    var commit: String?
    /// Blob SHA of each file as of the last sync: the "base" for detecting changes on either side.
    var files: [String: String] = [:]
    /// Unresolved conflicts: note path → path of the saved GitHub version.
    var conflicts: [String: String] = [:]

    static let fileURL = URL.applicationSupportDirectory.appending(path: "Sync/state.json")

    init(repository: String) {
        self.repository = repository
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        repository = try container.decode(String.self, forKey: .repository)
        commit = try container.decodeIfPresent(String.self, forKey: .commit)
        files = try container.decodeIfPresent([String: String].self, forKey: .files) ?? [:]
        conflicts = try container.decodeIfPresent([String: String].self, forKey: .conflicts) ?? [:]
    }

    static func load(from url: URL = fileURL) -> SyncState? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(SyncState.self, from: data)
    }

    func save(to url: URL = fileURL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: .atomic)
    }
}

struct SyncReport: Sendable {
    var downloaded = 0
    var deleted = 0
    var uploaded = 0
    /// Notes changed on both sides whose edits were combined automatically.
    var merged: [VaultPath] = []
    /// Notes changed on both sides in the same place; GitHub's version was saved next to them.
    var conflicts: [VaultPath] = []
    /// Local changes not uploaded because the user isn't signed in.
    var notUploaded = 0

    var changedVault: Bool { downloaded > 0 || deleted > 0 || !merged.isEmpty || !conflicts.isEmpty }
}

enum SyncEngineError: LocalizedError {
    case corruptDownload(VaultPath)

    var errorDescription: String? {
        switch self {
        case .corruptDownload(let path): "“\(path.name)” didn’t download correctly."
        }
    }
}

/// Two-way sync between the local vault directory and a remote.
///
/// Each run first brings in remote changes, then uploads local ones as a single commit.
/// Nothing is ever lost: a file changed on both sides is merged when the edits don't overlap;
/// otherwise the remote version is saved as a separate file for the user to review.
/// State is saved as work completes, so an interrupted sync resumes where it stopped.
struct SyncEngine: Sendable {
    let vaultRoot: URL
    let stateURL: URL
    let repositoryID: String
    let remote: any RemoteVault
    var canUpload = true
    /// First line of commit messages, e.g. "Update notes from iPhone".
    var commitTitle = "Update notes"

    private static let maxConcurrentDownloads = 6
    private static let mergeableExtensions: Set<String> = ["md", "markdown", "txt"]

    func sync(progress: @escaping @Sendable (_ done: Int, _ total: Int) -> Void = { _, _ in }) async throws -> SyncReport {
        var report = SyncReport()
        // If someone else pushes between our pull and upload, pull again and retry.
        for _ in 0..<3 {
            do {
                try await syncOnce(report: &report, progress: progress)
                return report
            } catch RemoteVaultError.outdated {
                continue
            }
        }
        throw GitHubError.notFastForward
    }

    private func syncOnce(report: inout SyncReport, progress: @escaping @Sendable (Int, Int) -> Void) async throws {
        var state = SyncState.load(from: stateURL).flatMap { $0.repository == repositoryID ? $0 : nil }
            ?? SyncState(repository: repositoryID)
        defer { try? state.save(to: stateURL) }

        dropSpuriousConflicts(state: &state)
        let head = try await remote.headCommit()
        if state.commit != head {
            try await pull(head: head, state: &state, report: &report, progress: progress)
        }

        let changes = localChanges(state: state)
        guard !changes.isEmpty else { return }
        guard canUpload else {
            report.notUploaded = changes.count
            return
        }
        let commit = try await remote.upload(changes, parent: head, message: commitMessage(for: changes, state: state))
        for (path, data) in changes {
            state.files[path.string] = data.map(GitBlobHash.of)
        }
        state.commit = commit
        report.uploaded += changes.count
    }

    // MARK: - Pull

    private func pull(head: String, state: inout SyncState, report: inout SyncReport,
                      progress: @escaping @Sendable (Int, Int) -> Void) async throws {
        let remoteFiles = try await remote.files(at: head)
        let base = Dictionary(uniqueKeysWithValues: state.files.map { (VaultPath($0.key), $0.value) })
        let local = localHashes(for: Set(base.keys).union(remoteFiles.keys))
        let plan = SyncPlanner.plan(base: base, local: local, remote: remoteFiles)

        var downloads: [(VaultPath, String)] = []
        var merges: [(VaultPath, String)] = []
        for (path, action) in plan.sorted(by: { $0.key < $1.key }) {
            switch action {
            case .none:
                state.files[path.string] = remoteFiles[path]
            case .download(let sha):
                downloads.append((path, sha))
            case .deleteLocal:
                try deleteFile(at: path)
                state.files[path.string] = nil
                report.deleted += 1
            case .upload:
                break
            case .restoreLocal:
                state.files[path.string] = nil  // treated as a new file and uploaded again
            case .merge(let sha):
                merges.append((path, sha))
            }
        }

        progress(0, downloads.count)
        try await withThrowingTaskGroup(of: (VaultPath, String).self) { group in
            var pending = downloads.makeIterator()
            func enqueue() {
                guard let (path, sha) = pending.next() else { return }
                group.addTask {
                    let data = try await download(sha: sha, for: path)
                    try writeFile(data, at: path)
                    return (path, sha)
                }
            }
            for _ in 0..<Self.maxConcurrentDownloads { enqueue() }
            for try await (path, sha) in group {
                state.files[path.string] = sha
                report.downloaded += 1
                progress(report.downloaded, downloads.count)
                enqueue()
            }
        }

        for (path, remoteSHA) in merges {
            let remoteData = try await download(sha: remoteSHA, for: path)
            if let merged = try await mergedData(at: path, remote: remoteData, baseSHA: base[path]) {
                try writeFile(merged, at: path)
                report.merged.append(path)
            } else {
                let copy = conflictCopyPath(for: path)
                try writeFile(remoteData, at: copy)
                state.conflicts[path.string] = copy.string
                report.conflicts.append(path)
            }
            // The remote version is now accounted for; what's on disk is uploaded as a local change.
            state.files[path.string] = remoteSHA
        }

        state.commit = head
    }

    private func download(sha: String, for path: VaultPath) async throws -> Data {
        let data = try await remote.download(sha: sha)
        guard GitBlobHash.of(data) == sha else { throw SyncEngineError.corruptDownload(path) }
        return data
    }

    private func mergedData(at path: VaultPath, remote remoteData: Data, baseSHA: String?) async throws -> Data? {
        if MapMerge.handles(path) {
            guard let localData = try? Data(contentsOf: url(for: path)) else { return nil }
            let baseData = try await baseSHA.asyncMap { try await download(sha: $0, for: path) }
            return MapMerge.merge(base: baseData, local: localData, remote: remoteData)
        }
        return try await mergedText(at: path, remote: remoteData, baseSHA: baseSHA).map { Data($0.utf8) }
    }

    private func mergedText(at path: VaultPath, remote remoteData: Data, baseSHA: String?) async throws -> String? {
        guard Self.mergeableExtensions.contains(path.pathExtension),
              let localData = try? Data(contentsOf: url(for: path)),
              let local = String(data: localData, encoding: .utf8),
              let remote = String(data: remoteData, encoding: .utf8) else { return nil }
        let base = try await baseSHA.asyncMap { String(decoding: try await download(sha: $0, for: path), as: UTF8.self) } ?? ""
        let localText = TextMerge.canonicalMarkdown(local)
        let remoteText = TextMerge.canonicalMarkdown(remote)
        let baseText = TextMerge.canonicalMarkdown(base)
        if let merged = TextMerge.merge(base: baseText, local: localText, remote: remoteText) { return merged }
        // `---` becoming an em dash (and a blank line around it) is the same note, not two authors.
        if TextMerge.sameNote(localText, remoteText) { return localText }
        return nil
    }

    /// Drops a saved conflict when the two copies are the same note apart from smart punctuation,
    /// or when it is a map file, which can always be combined.
    private func dropSpuriousConflicts(state: inout SyncState) {
        for (path, copy) in Array(state.conflicts) {
            let note = VaultPath(path)
            let copyPath = VaultPath(copy)
            // Map files merge by id; conflicts saved before that existed are combined here.
            if MapMerge.handles(note),
               let local = try? Data(contentsOf: url(for: note)),
               let remote = try? Data(contentsOf: url(for: copyPath)),
               let merged = MapMerge.merge(base: nil, local: local, remote: remote) {
                try? writeFile(merged, at: note)
                try? FileManager.default.removeItem(at: url(for: copyPath))
                state.conflicts[path] = nil
                continue
            }
            guard let local = try? String(contentsOf: url(for: note), encoding: .utf8),
                  let remote = try? String(contentsOf: url(for: copyPath), encoding: .utf8),
                  TextMerge.sameNote(local, remote) else { continue }
            let canonical = TextMerge.canonicalMarkdown(local)
            try? writeFile(Data(canonical.utf8), at: note)
            try? FileManager.default.removeItem(at: url(for: copyPath))
            state.conflicts[path] = nil
        }
    }

    /// "Note (GitHub version).md", numbered if that name is taken.
    private func conflictCopyPath(for path: VaultPath) -> VaultPath {
        let ext = path.pathExtension.isEmpty ? "" : "." + path.pathExtension
        var n = 1
        while true {
            let suffix = n == 1 ? " (GitHub version)" : " (GitHub version \(n))"
            let candidate = path.parent.appending(path.baseName + suffix + ext)
            if !FileManager.default.fileExists(atPath: url(for: candidate).path(percentEncoded: false)) { return candidate }
            n += 1
        }
    }

    // MARK: - Local changes

    /// Files added, edited or deleted on this device since the last sync (nil = deleted).
    /// Unresolved conflicts are held back until the user decides.
    private func localChanges(state: SyncState) -> [VaultPath: Data?] {
        let held = Set(state.conflicts.keys).union(state.conflicts.values)
        var changes: [VaultPath: Data?] = [:]
        var seen = Set<String>()
        for path in allLocalFiles() where !held.contains(path.string) {
            seen.insert(path.string)
            guard let data = try? Data(contentsOf: url(for: path)) else { continue }
            if state.files[path.string] != GitBlobHash.of(data) { changes[remoteSpelling(of: path, state: state)] = .some(data) }
        }
        for path in state.files.keys where !seen.contains(path) && !held.contains(path) {
            changes[VaultPath(path)] = .some(nil)
        }
        return changes
    }

    /// The path to upload a local file under. File systems may spell a name in a different Unicode
    /// normalization than the repository (Korean names written on macOS are decomposed, iOS reports them
    /// composed). Swift compares the two as equal but git doesn't, so reusing the repository's spelling
    /// keeps an edit from turning into a second, identical-looking file. New files are uploaded composed (NFC).
    func remoteSpelling(of path: VaultPath, state: SyncState) -> VaultPath {
        if let index = state.files.index(forKey: path.string) { return VaultPath(state.files[index].key) }
        return VaultPath(path.string.precomposedStringWithCanonicalMapping)
    }

    private func commitMessage(for changes: [VaultPath: Data?], state: SyncState) -> String {
        let lines = changes.keys.sorted().map { path -> String in
            let verb = changes[path]! == nil ? "Delete" : (state.files[path.string] == nil ? "Add" : "Edit")
            return "\(verb) \(path.string)"
        }
        let shown = lines.prefix(20) + (lines.count > 20 ? ["…and \(lines.count - 20) more"] : [])
        return commitTitle + "\n\n" + shown.joined(separator: "\n")
    }

    private func allLocalFiles() -> [VaultPath] {
        let root = vaultRoot.resolvingSymlinksInPath()
        guard let enumerator = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return [] }
        var paths: [VaultPath] = []
        let rootCount = root.pathComponents.count
        for case let url as URL in enumerator {
            guard (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
            paths.append(VaultPath(components: Array(url.resolvingSymlinksInPath().pathComponents.dropFirst(rootCount))))
        }
        // This one hidden root file is deliberately part of the local sync state because the
        // agent uses it to enforce the user's PKMS ignore rules.
        let ignoreURL = root.appending(path: ".aiignore", directoryHint: .notDirectory)
        if FileManager.default.fileExists(atPath: ignoreURL.path(percentEncoded: false)) {
            paths.append(VaultPath(".aiignore"))
        }
        return paths
    }

    // MARK: - Files

    private func url(for path: VaultPath) -> URL {
        path.components.reduce(vaultRoot) { $0.appending(path: $1, directoryHint: .notDirectory) }
    }

    private func localHashes(for paths: Set<VaultPath>) -> [VaultPath: String] {
        var hashes: [VaultPath: String] = [:]
        for path in paths {
            if let data = try? Data(contentsOf: url(for: path), options: .mappedIfSafe) {
                hashes[path] = GitBlobHash.of(data)
            }
        }
        return hashes
    }

    private func writeFile(_ data: Data, at path: VaultPath) throws {
        let url = url(for: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }

    /// Deletes a file, then removes any folders it leaves empty.
    private func deleteFile(at path: VaultPath) throws {
        let fm = FileManager.default
        try? fm.removeItem(at: url(for: path))
        var folder = path.parent
        while !folder.isRoot {
            let folderURL = url(for: folder)
            guard let contents = try? fm.contentsOfDirectory(atPath: folderURL.path(percentEncoded: false)),
                  contents.allSatisfy({ $0 == ".DS_Store" }) else { break }
            try fm.removeItem(at: folderURL)
            folder = folder.parent
        }
    }

    // MARK: - Conflicts

    enum Resolution {
        /// Keep this device's version and discard GitHub's.
        case keepLocal
        /// Replace this device's version with GitHub's.
        case keepRemote
        /// Keep both as separate notes.
        case keepBoth
    }

    /// Applies the user's choice for a conflict. The next sync uploads the result.
    func resolveConflict(_ path: VaultPath, _ resolution: Resolution) throws {
        guard var state = SyncState.load(from: stateURL), let copy = state.conflicts[path.string].map(VaultPath.init) else { return }
        switch resolution {
        case .keepLocal:
            try? FileManager.default.removeItem(at: url(for: copy))
        case .keepRemote:
            _ = try FileManager.default.replaceItemAt(url(for: path), withItemAt: url(for: copy))
        case .keepBoth:
            break
        }
        state.conflicts[path.string] = nil
        try state.save(to: stateURL)
    }
}
