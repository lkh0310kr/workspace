import Foundation
import Testing
@testable import PKMS

struct VaultMoveTests {
    @Test @MainActor func movesANoteIntoAFolder() async throws {
        let harness = try MoveHarness()
        try harness.repo.writeText("# Hi\n", to: VaultPath("Note.md"))
        try harness.repo.createFolder(at: VaultPath("Projects"))
        await harness.store.reload()
        let moved = try await harness.store.move(VaultPath("Note.md"), into: VaultPath("Projects"))
        #expect(moved == VaultPath("Projects/Note.md"))
        #expect(harness.repo.exists(moved))
        #expect(!harness.repo.exists(VaultPath("Note.md")))
        #expect(harness.store.lastMove == VaultStore.Move(from: VaultPath("Note.md"), to: moved))
    }

    @Test @MainActor func movesAFolderAndKeepsItsNotes() async throws {
        let harness = try MoveHarness()
        try harness.repo.createFolder(at: VaultPath("Archive"))
        try harness.repo.writeText("# \n", to: VaultPath("Work/Plan.md"))
        await harness.store.reload()
        let moved = try await harness.store.move(VaultPath("Work"), into: VaultPath("Archive"))
        #expect(moved == VaultPath("Archive/Work"))
        #expect(harness.repo.exists(VaultPath("Archive/Work/Plan.md")))
    }

    @Test @MainActor func addsASuffixWhenTheNameIsTaken() async throws {
        let harness = try MoveHarness()
        try harness.repo.writeText("a", to: VaultPath("Note.md"))
        try harness.repo.writeText("b", to: VaultPath("Projects/Note.md"))
        await harness.store.reload()
        let moved = try await harness.store.move(VaultPath("Note.md"), into: VaultPath("Projects"))
        #expect(moved == VaultPath("Projects/Note 2.md"))
        #expect(try await harness.repo.readText(at: VaultPath("Projects/Note.md")) == "b")
    }

    @Test @MainActor func refusesToMoveAFolderIntoItself() async throws {
        let harness = try MoveHarness()
        try harness.repo.createFolder(at: VaultPath("Work/Nested"))
        await harness.store.reload()
        #expect(!harness.store.canMove(VaultPath("Work"), into: VaultPath("Work")))
        #expect(!harness.store.canMove(VaultPath("Work"), into: VaultPath("Work/Nested")))
        #expect(!harness.store.canMove(VaultPath("Work/Nested"), into: VaultPath("Work")))
        await #expect(throws: VaultError.cannotMoveIntoItself) {
            try await harness.store.move(VaultPath("Work"), into: VaultPath("Work/Nested"))
        }
    }

    @Test @MainActor func recentNotesFollowOpensMovesAndDeletes() async throws {
        let suite = "pkms-recent-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }

        let root = FileManager.default.temporaryDirectory.appending(path: "pkms-recent-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let repo = LocalVaultRepository(rootURL: root)
        try repo.writeText("a", to: VaultPath("A.md"))
        try repo.writeText("b", to: VaultPath("Work/Plan.md"))
        try repo.createFolder(at: VaultPath("Archive"))
        let store = VaultStore(repository: repo, defaults: defaults)
        await store.reload()

        store.recordView(VaultPath("A.md"))
        store.recordView(VaultPath("Work/Plan.md"))
        store.recordView(VaultPath("A.md"))
        store.recordView(VaultPath("not-a-note"))
        #expect(store.recentNotes.map(\.path) == [VaultPath("A.md"), VaultPath("Work/Plan.md")])

        _ = try await store.move(VaultPath("Work"), into: VaultPath("Archive"))
        #expect(store.recentNotes.map(\.path) == [VaultPath("A.md"), VaultPath("Archive/Work/Plan.md")])

        _ = try await store.rename(VaultPath("A.md"), to: "Alpha")
        #expect(store.recentNotes.map(\.path) == [VaultPath("Alpha.md"), VaultPath("Archive/Work/Plan.md")])

        try await store.delete(VaultPath("Archive"))
        #expect(store.recentNotes.map(\.path) == [VaultPath("Alpha.md")])

        let reloaded = VaultStore(repository: repo, defaults: defaults)
        await reloaded.reload()
        #expect(reloaded.recentNotes.map(\.path) == [VaultPath("Alpha.md")])

        try repo.delete(VaultPath("Alpha.md"))
        await reloaded.reload()
        #expect(reloaded.recentNotes.isEmpty)
    }
}

private struct MoveHarness {
    let root: URL
    let repo: LocalVaultRepository
    let store: VaultStore

    @MainActor init() throws {
        root = FileManager.default.temporaryDirectory.appending(path: "pkms-move-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        repo = LocalVaultRepository(rootURL: root)
        store = VaultStore(repository: repo)
    }
}

struct GitBlobHashTests {
    @Test func matchesGit() {
        // `git hash-object` of an empty file and of "hello\n".
        #expect(GitBlobHash.of(Data()) == "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
        #expect(GitBlobHash.of(Data("hello\n".utf8)) == "ce013625030ba8dba906f756967f9e9ca394464a")
    }
}

struct SyncPlannerTests {
    @Test func threeWayRules() {
        #expect(SyncPlanner.action(base: "a", local: "a", remote: "a") == .none)
        #expect(SyncPlanner.action(base: nil, local: nil, remote: "b") == .download(sha: "b"))
        #expect(SyncPlanner.action(base: "a", local: "a", remote: "b") == .download(sha: "b"))
        #expect(SyncPlanner.action(base: "a", local: "a", remote: nil) == .deleteLocal)
        #expect(SyncPlanner.action(base: "a", local: "c", remote: "a") == .upload)
        #expect(SyncPlanner.action(base: "a", local: nil, remote: "a") == .upload)
        #expect(SyncPlanner.action(base: "a", local: "c", remote: "b") == .merge(remoteSHA: "b"))
        #expect(SyncPlanner.action(base: nil, local: "c", remote: "b") == .merge(remoteSHA: "b"))
        #expect(SyncPlanner.action(base: "a", local: "b", remote: "b") == .none)
        // Edit beats delete, in both directions.
        #expect(SyncPlanner.action(base: "a", local: "c", remote: nil) == .restoreLocal)
        #expect(SyncPlanner.action(base: "a", local: nil, remote: "b") == .download(sha: "b"))
    }
}

struct TextMergeTests {
    @Test func combinesEditsInDifferentPlaces() {
        let base = "# Title\none\ntwo\nthree\nfour"
        let local = "# Title\nONE\ntwo\nthree\nfour"
        let remote = "# Title\none\ntwo\nthree\nFOUR\nfive"
        #expect(TextMerge.merge(base: base, local: local, remote: remote) == "# Title\nONE\ntwo\nthree\nFOUR\nfive")
    }

    @Test func mergesAdjacentLines() {
        #expect(TextMerge.merge(base: "a\nb\nc", local: "A\nb\nc", remote: "a\nB\nc") == "A\nB\nc")
    }

    @Test func conflictsOnSameLine() {
        #expect(TextMerge.merge(base: "a\nb", local: "a\nlocal", remote: "a\nremote") == nil)
    }

    @Test func emDashRuleIsNotAConflict() {
        let base = "intro"
        let remote = "intro\n\n---\n\nnext"
        let local = "intro\n\n—\n\n\nnext"
        #expect(TextMerge.canonicalMarkdown(local) == "intro\n\n---\n\n\nnext")
        #expect(TextMerge.sameNote(local, remote))
        #expect(!TextMerge.sameNote("hello", "hello there"))
    }

    @Test func identicalChangesAreFine() {
        #expect(TextMerge.merge(base: "a\nb", local: "a\nc", remote: "a\nc") == "a\nc")
    }

    @Test func insertionsAtDifferentPoints() {
        #expect(TextMerge.merge(base: "a\nb", local: "x\na\nb", remote: "a\nb\ny") == "x\na\nb\ny")
    }
}

/// In-memory remote: `files` maps paths to contents at the current head.
final class FakeRemote: RemoteVault, @unchecked Sendable {
    private let lock = NSLock()
    private var _head = "c1"
    private var _files: [String: String] = [:]
    private var blobs: [String: Data] = [:]
    private var downloadCount = 0
    private(set) var uploads: [[String: String?]] = []

    var head: String { lock.withLock { _head } }
    var files: [String: String] {
        get { lock.withLock { _files } }
        set { lock.withLock { _files = newValue; for text in newValue.values { blobs[GitBlobHash.of(Data(text.utf8))] = Data(text.utf8) } } }
    }
    var downloads: Int { lock.withLock { downloadCount } }

    /// Simulates another device pushing a commit.
    func commit(_ newFiles: [String: String]) {
        files = newFiles
        lock.withLock { _head = "c\(Int(_head.dropFirst())! + 1)" }
    }

    func headCommit() async throws -> String { head }

    func files(at commit: String) async throws -> [VaultPath: String] {
        Dictionary(uniqueKeysWithValues: files.map { (VaultPath($0.key), GitBlobHash.of(Data($0.value.utf8))) })
    }

    func download(sha: String) async throws -> Data {
        lock.withLock {
            downloadCount += 1
            return blobs[sha]!
        }
    }

    func upload(_ changes: [VaultPath: Data?], parent: String, message: String) async throws -> String {
        guard parent == head else { throw RemoteVaultError.outdated }
        var next = files
        for (path, data) in changes {
            next[path.string] = data.map { String(decoding: $0, as: UTF8.self) }
        }
        lock.withLock { uploads.append(changes.reduce(into: [:]) { $0[$1.key.string] = $1.value.map { String(decoding: $0, as: UTF8.self) } }) }
        commit(next)
        return head
    }
}

struct SyncEngineTests {
    let root = URL.temporaryDirectory.appending(path: "vault-\(UUID().uuidString)")
    let stateURL = URL.temporaryDirectory.appending(path: "state-\(UUID().uuidString).json")
    let remote = FakeRemote()

    init() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    private func engine(canUpload: Bool = true) -> SyncEngine {
        SyncEngine(vaultRoot: root, stateURL: stateURL, repositoryID: "me/notes@main", remote: remote, canUpload: canUpload)
    }

    private func read(_ path: String) -> String? {
        try? String(contentsOf: root.appending(path: path), encoding: .utf8)
    }

    private func write(_ path: String, _ text: String) throws {
        let url = root.appending(path: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url)
    }

    private func cleanUp() {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: stateURL)
    }

    @Test func pullsAddsUpdatesAndDeletes() async throws {
        defer { cleanUp() }
        remote.files = ["README.md": "# Hi", "Notes/a.md": "A", "Notes/b.md": "B"]
        var report = try await engine().sync()
        #expect(report.downloaded == 3)
        #expect(read("Notes/a.md") == "A")

        // Unchanged head: nothing is fetched or uploaded.
        report = try await engine().sync()
        #expect(report.downloaded == 0 && report.uploaded == 0 && remote.downloads == 3)

        remote.commit(["README.md": "# Hi", "Notes/a.md": "A2"])
        report = try await engine().sync()
        #expect(report.downloaded == 1 && report.deleted == 1)
        #expect(read("Notes/a.md") == "A2")
        #expect(read("Notes/b.md") == nil)

        remote.commit(["README.md": "# Hi"])
        _ = try await engine().sync()
        #expect(!FileManager.default.fileExists(atPath: root.appending(path: "Notes").path(percentEncoded: false)))
    }

    @Test func uploadsLocalEditsAdditionsAndDeletions() async throws {
        defer { cleanUp() }
        remote.files = ["a.md": "A", "b.md": "B"]
        _ = try await engine().sync()

        try write("a.md", "A edited")
        try write("New/c.md", "C")
        try FileManager.default.removeItem(at: root.appending(path: "b.md"))
        let report = try await engine().sync()

        #expect(report.uploaded == 3)
        #expect(remote.files == ["a.md": "A edited", "New/c.md": "C"])
        // Nothing left to upload afterwards.
        #expect(try await engine().sync().uploaded == 0)
    }

    @Test func holdsUploadsWhenSignedOut() async throws {
        defer { cleanUp() }
        remote.files = ["a.md": "A"]
        _ = try await engine().sync()
        try write("a.md", "A edited")
        let report = try await engine(canUpload: false).sync()
        #expect(report.notUploaded == 1)
        #expect(remote.files["a.md"] == "A")
    }

    @Test func mergesEditsFromBothSides() async throws {
        defer { cleanUp() }
        remote.files = ["n.md": "# Note\none\ntwo\nthree"]
        _ = try await engine().sync()

        try write("n.md", "# Note\nONE\ntwo\nthree")
        remote.commit(["n.md": "# Note\none\ntwo\nTHREE"])
        let report = try await engine().sync()

        #expect(report.merged == [VaultPath("n.md")])
        #expect(read("n.md") == "# Note\nONE\ntwo\nTHREE")
        #expect(remote.files["n.md"] == "# Note\nONE\ntwo\nTHREE")
    }

    @Test func keepsBothVersionsOnRealConflict() async throws {
        defer { cleanUp() }
        remote.files = ["n.md": "hello"]
        _ = try await engine().sync()

        try write("n.md", "hello from phone")
        remote.commit(["n.md": "hello from laptop"])
        let report = try await engine().sync()

        #expect(report.conflicts == [VaultPath("n.md")])
        #expect(read("n.md") == "hello from phone")
        #expect(read("n (GitHub version).md") == "hello from laptop")
        // Held back from GitHub until the user decides.
        #expect(remote.files == ["n.md": "hello from laptop"])

        try engine().resolveConflict(VaultPath("n.md"), .keepLocal)
        _ = try await engine().sync()
        #expect(remote.files == ["n.md": "hello from phone"])
        #expect(read("n (GitHub version).md") == nil)
    }

    @Test func mapFilesMergeByID() async throws {
        defer { cleanUp() }
        let path = "Places.map/folders.json"
        remote.files = [path: #"{"folders":[{"id":1,"title":"대구"},{"id":2,"title":"서울"}]}"#]
        _ = try await engine().sync()

        // The phone colors a folder while another device adds one and renames another.
        try write(path, #"{"folders":[{"id":1,"title":"대구","color":"green"},{"id":2,"title":"서울"}]}"#)
        remote.commit([path: #"{"folders":[{"id":1,"title":"대구"},{"id":3,"title":"음식점"},{"id":2,"title":"Seoul"}]}"#])
        let report = try await engine().sync()

        #expect(report.conflicts.isEmpty)
        #expect(report.merged == [VaultPath(path)])
        let merged = try JSONSerialization.jsonObject(with: Data(try #require(remote.files[path]).utf8)) as? [String: [[String: Any]]]
        let folders = try #require(merged?["folders"])
        #expect(folders.map { $0["title"] as? String } == ["대구", "음식점", "Seoul"])
        #expect(folders[0]["color"] as? String == "green")
    }

    @Test func mapRecordsDeletedOnOneSideStayDeleted() throws {
        let base = Data(#"[{"id":1,"name":"A"},{"id":2,"name":"B"}]"#.utf8)
        let local = Data(#"[{"id":1,"name":"A"}]"#.utf8)
        let remote = Data(#"[{"id":1,"name":"A"},{"id":2,"name":"B"},{"id":3,"name":"C"}]"#.utf8)
        let merged = try #require(MapMerge.merge(base: base, local: local, remote: remote))
        let names = (try JSONSerialization.jsonObject(with: merged) as? [[String: Any]])?.map { $0["name"] as? String }
        #expect(names == ["A", "C"])
    }

    @Test func oldMapConflictsAreCombinedOnNextSync() async throws {
        defer { cleanUp() }
        let path = "Places.map/folders.json"
        remote.files = [path: #"{"folders":[{"id":1,"title":"대구"},{"id":2,"title":"서울"}]}"#]
        _ = try await engine().sync()
        // A conflict saved by an older version: the phone's file plus GitHub's copy next to it.
        try write(path, #"{"folders":[{"id":1,"title":"대구","color":"green"}]}"#)
        try write("Places.map/folders (GitHub version).json", #"{"folders":[{"id":1,"title":"대구"},{"id":2,"title":"서울"}]}"#)
        var state = try #require(SyncState.load(from: stateURL))
        state.conflicts[path] = "Places.map/folders (GitHub version).json"
        try state.save(to: stateURL)

        _ = try await engine().sync()
        #expect(SyncState.load(from: stateURL)?.conflicts.isEmpty == true)
        #expect(read("Places.map/folders (GitHub version).json") == nil)
        let uploaded = try #require(remote.files[path])
        #expect(uploaded.contains("green") && uploaded.contains("서울"))
    }

    @Test func conflictResolutionKeepRemote() async throws {
        defer { cleanUp() }
        remote.files = ["n.md": "hello"]
        _ = try await engine().sync()
        try write("n.md", "mine")
        remote.commit(["n.md": "theirs"])
        _ = try await engine().sync()

        try engine().resolveConflict(VaultPath("n.md"), .keepRemote)
        let report = try await engine().sync()
        #expect(read("n.md") == "theirs")
        #expect(report.uploaded == 0)
        #expect(remote.files == ["n.md": "theirs"])
    }

    @Test func editWinsOverRemoteDelete() async throws {
        defer { cleanUp() }
        remote.files = ["a.md": "A", "b.md": "B"]
        _ = try await engine().sync()
        try write("a.md", "A edited")
        remote.commit(["b.md": "B"])
        _ = try await engine().sync()
        #expect(remote.files["a.md"] == "A edited")
    }

    @Test func uploadsUnderTheRepositorysUnicodeSpelling() {
        let decomposed = "중국 소싱.md".decomposedStringWithCanonicalMapping   // as written by macOS
        let composed = "중국 소싱.md".precomposedStringWithCanonicalMapping    // as iOS reports it
        var state = SyncState(repository: "me/notes@main")
        state.files[decomposed] = "sha"
        // The file system hands back the composed name; the upload must reuse the repository's spelling.
        let path = engine().remoteSpelling(of: VaultPath(composed), state: state)
        #expect(path.string.utf8.elementsEqual(decomposed.utf8), "must edit the existing file, not add a second one")
    }

    @Test func newFilesUploadComposed() async throws {
        defer { cleanUp() }
        remote.files = [:]
        _ = try await engine().sync()
        try write("노트.md".decomposedStringWithCanonicalMapping, "x")
        _ = try await engine().sync()
        let uploaded = try #require(remote.uploads.last?.keys.first)
        #expect(uploaded.utf8.elementsEqual("노트.md".precomposedStringWithCanonicalMapping.utf8))
    }

    @Test func retriesWhenRemoteMovesDuringUpload() async throws {
        defer { cleanUp() }
        remote.files = ["a.md": "A", "b.md": "B"]
        _ = try await engine().sync()
        try write("a.md", "A edited")

        // Another device pushes after our pull but before our upload.
        let racing = RacingRemote(inner: remote) { $0.commit(["a.md": "A", "b.md": "B edited"]) }
        let engine = SyncEngine(vaultRoot: root, stateURL: stateURL, repositoryID: "me/notes@main", remote: racing)
        _ = try await engine.sync()

        #expect(remote.files == ["a.md": "A edited", "b.md": "B edited"])
        #expect(read("b.md") == "B edited")
    }
}

/// Wraps a remote and runs `beforeFirstUpload` once, just before the first upload.
final class RacingRemote: RemoteVault, @unchecked Sendable {
    let inner: FakeRemote
    private var hook: ((FakeRemote) -> Void)?

    init(inner: FakeRemote, beforeFirstUpload: @escaping (FakeRemote) -> Void) {
        self.inner = inner
        self.hook = beforeFirstUpload
    }

    func headCommit() async throws -> String { try await inner.headCommit() }
    func files(at commit: String) async throws -> [VaultPath: String] { try await inner.files(at: commit) }
    func download(sha: String) async throws -> Data { try await inner.download(sha: sha) }

    func upload(_ changes: [VaultPath: Data?], parent: String, message: String) async throws -> String {
        if let hook {
            self.hook = nil
            hook(inner)
        }
        return try await inner.upload(changes, parent: parent, message: message)
    }
}

struct GitHubRepositoryListTests {
    @Test func includesPrivateReposFromTheAppInstallation() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [InstallationRepoStub.self]
        let client = GitHubClient(token: "ghu_test", session: URLSession(configuration: config))
        let names = try await client.repositories().map(\.fullName)
        #expect(names.contains("me/private-notes"))
        #expect(names.contains("me/public"))
    }
}

/// Installation listing returns the private repo; `/user/repos` returns only a public one.
private final class InstallationRepoStub: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let body: String
        if path == "/user/installations" {
            body = #"{"total_count":1,"installations":[{"id":7}]}"#
        } else if path.hasPrefix("/user/installations/") {
            body = #"{"total_count":1,"repositories":[{"full_name":"me/private-notes","default_branch":"main","private":true}]}"#
        } else {
            body = #"[{"full_name":"me/public","default_branch":"main","private":false}]"#
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

struct GitHubCredentialTests {
    @Test func readsLegacyPlainToken() {
        let credentials = TokenStore.credentials(from: Data("gho_legacy".utf8))
        #expect(credentials?.accessToken == "gho_legacy")
        #expect(credentials?.refreshToken == nil)
        #expect(credentials?.needsRefresh == false)
    }

    @Test func roundTripsStoredCredentials() throws {
        let original = GitHubCredentials(
            accessToken: "ghu_a",
            refreshToken: "ghr_b",
            accessExpiresAt: Date(timeIntervalSince1970: 1_700_000_000),
            refreshExpiresAt: Date(timeIntervalSince1970: 1_800_000_000)
        )
        let data = try JSONEncoder().encode(original)
        #expect(TokenStore.credentials(from: data) == original)
    }

    @Test func refreshesNearExpiryOnly() {
        let soon = GitHubCredentials(
            accessToken: "a", refreshToken: "r",
            accessExpiresAt: .now.addingTimeInterval(60),
            refreshExpiresAt: .distantFuture
        )
        let later = GitHubCredentials(
            accessToken: "a", refreshToken: "r",
            accessExpiresAt: .now.addingTimeInterval(3600),
            refreshExpiresAt: .distantFuture
        )
        let expiredRefresh = GitHubCredentials(
            accessToken: "a", refreshToken: "r",
            accessExpiresAt: .distantPast,
            refreshExpiresAt: .distantPast
        )
        #expect(soon.needsRefresh)
        #expect(!later.needsRefresh)
        #expect(!expiredRefresh.refreshTokenIsUsable)
        #expect(!expiredRefresh.needsRefresh)
    }

    @Test func oneRefreshServesConcurrentCalls() async throws {
        let tally = RefreshTally()
        let account = GitHubAccount(
            credentials: GitHubCredentials(
                accessToken: "old", refreshToken: "refresh",
                accessExpiresAt: .distantPast, refreshExpiresAt: .distantFuture
            ),
            persist: false
        ) { _ in
            await tally.bump()
            try await Task.sleep(for: .milliseconds(50))
            return GitHubCredentials(
                accessToken: "new", refreshToken: "refresh-2",
                accessExpiresAt: .distantFuture, refreshExpiresAt: .distantFuture
            )
        }
        async let first = account.accessToken()
        async let second = account.accessToken()
        let tokens = try await [first, second]
        #expect(tokens == ["new", "new"])
        #expect(await tally.value == 1)
    }

    @Test func signOutDropsALateRefresh() async {
        let tally = RefreshTally()
        let gate = RefreshGate()
        let account = GitHubAccount(
            credentials: GitHubCredentials(
                accessToken: "old", refreshToken: "refresh",
                accessExpiresAt: .distantPast, refreshExpiresAt: .distantFuture
            ),
            persist: false
        ) { _ in
            await tally.bump()
            await gate.wait()
            return GitHubCredentials(
                accessToken: "resurrected", refreshToken: "refresh-2",
                accessExpiresAt: .distantFuture, refreshExpiresAt: .distantFuture
            )
        }
        let pending = Task { try await account.accessToken() }
        var spins = 0
        while await tally.value == 0 {
            spins += 1
            if spins > 1_000 {
                Issue.record("Refresh never started")
                gate.open()
                return
            }
            await Task.yield()
        }
        await account.clear(ticket: 0)
        gate.open()
        if case .success = await pending.result {
            Issue.record("Refresh after sign-out should not yield a token")
        }
        await #expect(throws: GitHubError.unauthorized) {
            try await account.accessToken()
        }
    }

    @Test func retriesWithRefreshedTokenAfter401() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [GitHubRetryStub.self]
        let account = GitHubAccount(
            credentials: GitHubCredentials(
                accessToken: "old", refreshToken: "refresh",
                accessExpiresAt: .distantFuture, refreshExpiresAt: .distantFuture
            ),
            persist: false
        ) { _ in
            GitHubCredentials(
                accessToken: "new", refreshToken: "refresh-2",
                accessExpiresAt: .distantFuture, refreshExpiresAt: .distantFuture
            )
        }
        let client = GitHubClient(token: "old", account: account, session: URLSession(configuration: config))
        let user = try await client.currentUser()
        #expect(user.login == "octocat")
        #expect(GitHubRetryStub.authorizations == ["Bearer old", "Bearer new"])
    }
}

private actor RefreshTally {
    private(set) var value = 0
    func bump() { value += 1 }
}

/// Lets a test hold a refresh until sign-out has run.
private final class RefreshGate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Never>?
    private var opened = false

    func wait() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            self.lock.lock()
            if self.opened {
                self.lock.unlock()
                continuation.resume()
                return
            }
            self.continuation = continuation
            self.lock.unlock()
        }
    }

    func open() {
        lock.lock()
        opened = true
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume()
    }
}

/// First API call answers 401, the retry answers the current user. Records Authorization headers.
private final class GitHubRetryStub: URLProtocol, @unchecked Sendable {
    private final class Log: @unchecked Sendable {
        let lock = NSLock()
        var recorded: [String?] = []
    }

    private static let log = Log()

    static var authorizations: [String?] {
        log.lock.lock()
        defer { log.lock.unlock() }
        return log.recorded
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.log.lock.lock()
        Self.log.recorded.append(request.value(forHTTPHeaderField: "Authorization"))
        let hit = Self.log.recorded.count
        Self.log.lock.unlock()
        let status = hit == 1 ? 401 : 200
        let body = hit == 1 ? Data() : Data(#"{"login":"octocat"}"#.utf8)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
