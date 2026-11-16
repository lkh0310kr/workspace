import XCTest
@testable import PKMS

final class PKMSDocumentCachePolicyTests: XCTestCase {
    func testPendingDocumentIDsAreWorkspaceScopedAndSorted() {
        let ids = PKMSDocumentCachePolicy.pendingDocumentIDs(
            workspaceID: "workspace-a",
            pendingKeys: [
                "workspace-a/file-2",
                "workspace-a/file-1",
                "workspace-b/file-3",
                "workspace-a/",
                "workspace-a/folder/file-4",
            ]
        )

        XCTAssertEqual(ids, ["file-1", "file-2"])
    }

    func testDirtyDocumentsRemainCachedPastRecentLimit() {
        let pending: Set<String> = ["workspace/dirty"]
        let recent = (0..<PKMSDocumentCachePolicy.recentLimit + 4).map { "workspace/clean-\($0)" }

        let retained = PKMSDocumentCachePolicy.retainedKeys(
            afterAdding: "workspace/new",
            to: recent,
            pending: pending
        )

        XCTAssertTrue(retained.contains("workspace/dirty"))
        XCTAssertTrue(retained.contains("workspace/new"))
        XCTAssertEqual(retained.filter { !pending.contains($0) }.count, PKMSDocumentCachePolicy.recentLimit)
    }

    func testOnlyLatestFinalIncrementalAckWithoutFullStateRequirementClearsPending() {
        XCTAssertTrue(PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 4,
            currentGeneration: 4,
            isFinalUpdate: true,
            requiresFullState: false
        ))
        XCTAssertFalse(PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 3,
            currentGeneration: 4,
            isFinalUpdate: true,
            requiresFullState: false
        ))
        XCTAssertFalse(PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 4,
            currentGeneration: 4,
            isFinalUpdate: false,
            requiresFullState: false
        ))
        XCTAssertFalse(PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 4,
            currentGeneration: 4,
            isFinalUpdate: true,
            requiresFullState: true
        ))
    }
}

@MainActor
final class PKMSWorkspaceCacheFirstTests: XCTestCase {
    func testCachedTreeIsVisibleBeforeSnapshotAndSurvivesRateLimitResponse() async throws {
        let workspaceID = "cache-first-\(UUID().uuidString)"
        let directory = FileManager.default.temporaryDirectory.appending(path: "PKMS-TreeCache-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = PKMSWorkspaceTreeCacheStore(directory: directory)
        let cachedFile = PKMSFile(
            id: "cached-file",
            path: "cached.md",
            kind: "markdown",
            revision: 7,
            content: nil,
            contentType: "text/markdown",
            size: 12,
            sha256: nil
        )
        await cache.write(
            PKMSWorkspaceTreeCache(files: [cachedFile], loadedDirectories: [""], savedAt: .now),
            workspaceID: workspaceID
        )

        let requestStarted = expectation(description: "snapshot request started")
        let gate = PKMSURLProtocolGate(
            requestStarted: requestStarted,
            gatedPath: "/api/workspaces/\(workspaceID)/snapshot",
            fallback: .init(statusCode: 429, body: Data(#"{"error":"rate_limited"}"#.utf8))
        )
        PKMSStubURLProtocol.install(gate)
        defer { PKMSStubURLProtocol.install(nil) }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PKMSStubURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let model = PKMSModel(
            transport: PKMSAPITransport(session: session),
            treeCache: cache
        )
        model.serverAddress = "https://pkms.test"
        model.token = "test-token"
        let workspace = PKMSWorkspace(
            id: workspaceID,
            repository: "owner/repo",
            branch: "main",
            revision: 7,
            githubStatus: "synced",
            message: nil,
            lastGitHubCommitAt: nil
        )

        let selection = Task { await model.selectWorkspace(workspace) }
        await fulfillment(of: [requestStarted], timeout: 5)
        XCTAssertTrue(model.isLoading)
        XCTAssertEqual(model.files.map(\.id), ["cached-file"], "Cached tree should be present while cloud snapshot is pending")

        gate.releaseResponse.signal()
        await selection.value

        XCTAssertEqual(model.files.map(\.id), ["cached-file"], "Rate limit must not clear the last cached tree")
        XCTAssertNotNil(model.errorMessage, "A stale cached tree must not hide the failed cloud refresh")
    }

    func testSuccessfulSnapshotAndDirectoryListingMergeIntoCachedTree() async throws {
        let workspaceID = "cache-merge-\(UUID().uuidString)"
        let directory = FileManager.default.temporaryDirectory.appending(path: "PKMS-TreeCache-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = PKMSWorkspaceTreeCacheStore(directory: directory)
        let cachedFile = PKMSFile(id: "cached", path: "cached.md", kind: "markdown", revision: 7, content: nil, contentType: "text/markdown", size: 12, sha256: nil)
        await cache.write(PKMSWorkspaceTreeCache(files: [cachedFile], loadedDirectories: [""], savedAt: .now), workspaceID: workspaceID)

        let cloudFile: [String: Any] = [
            "id": "cloud", "path": "cloud.md", "kind": "markdown", "revision": 8,
            "content": NSNull(), "contentType": "text/markdown", "size": 14, "sha256": NSNull(),
        ]
        let snapshot = try JSONSerialization.data(withJSONObject: [
            "workspaceId": workspaceID, "revision": 8, "files": [cloudFile],
            "hasMore": false, "nextRevision": NSNull(), "afterRevision": NSNull(),
        ])
        let rootListing = try JSONSerialization.data(withJSONObject: ["path": "", "files": [cloudFile]])
        let syncStatus = try JSONSerialization.data(withJSONObject: [
            "serverRevision": 8, "githubStatus": "synced", "githubHead": NSNull(),
            "lastGitHubCommitAt": NSNull(), "nextGitHubFlushAt": NSNull(), "pendingFiles": 0, "message": NSNull(),
        ])
        let gate = PKMSURLProtocolGate(
            replies: [
                "/api/workspaces/\(workspaceID)/snapshot": .init(statusCode: 200, body: snapshot),
                "/api/workspaces/\(workspaceID)/directory": .init(statusCode: 200, body: rootListing),
                "/api/workspaces/\(workspaceID)/sync-status": .init(statusCode: 200, body: syncStatus),
            ],
            fallback: .init(statusCode: 404, body: Data(#"{"error":"not_found"}"#.utf8))
        )
        PKMSStubURLProtocol.install(gate)
        defer { PKMSStubURLProtocol.install(nil) }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PKMSStubURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let model = PKMSModel(transport: PKMSAPITransport(session: session), treeCache: cache)
        model.serverAddress = "https://pkms.test"
        let workspace = PKMSWorkspace(id: workspaceID, repository: "owner/repo", branch: "main", revision: 7, githubStatus: "synced", message: nil, lastGitHubCommitAt: nil)
        model.workspaces = [workspace]

        await model.selectWorkspace(workspace)
        model.disconnectRealtime()

        XCTAssertEqual(model.files.map(\.id), ["cloud"], "The authoritative root listing should remove stale cached entries")
        XCTAssertTrue(model.loadedDirectories.contains(""))
        XCTAssertEqual(model.activeWorkspace?.revision, 8, "The active workspace must advance to the snapshot revision before later operations")
        XCTAssertEqual(model.workspaces.first?.revision, 8, "The workspace list must share the refreshed operation base revision")
    }

    func testRealtimeResubscribeReloadsMissedTreeChangesAndRevision() async throws {
        let workspaceID = "reconnect-\(UUID().uuidString)"
        let oldFile = PKMSFile(id: "old", path: "old.md", kind: "markdown", revision: 4, content: nil, contentType: "text/markdown", size: 3, sha256: nil)
        let newFile: [String: Any] = [
            "id": "new", "path": "new.md", "kind": "markdown", "revision": 12,
            "content": NSNull(), "contentType": "text/markdown", "size": 4, "sha256": NSNull(),
        ]
        let snapshot = try JSONSerialization.data(withJSONObject: [
            "workspaceId": workspaceID, "revision": 12, "files": [newFile],
            "hasMore": false, "nextRevision": NSNull(), "afterRevision": NSNull(),
        ])
        let rootListing = try JSONSerialization.data(withJSONObject: ["path": "", "files": [newFile]])
        let gate = PKMSURLProtocolGate(
            replies: [
                "/api/workspaces/\(workspaceID)/snapshot": .init(statusCode: 200, body: snapshot),
                "/api/workspaces/\(workspaceID)/directory": .init(statusCode: 200, body: rootListing),
            ],
            fallback: .init(statusCode: 404, body: Data(#"{"error":"not_found"}"#.utf8))
        )
        PKMSStubURLProtocol.install(gate)
        defer { PKMSStubURLProtocol.install(nil) }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PKMSStubURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let model = PKMSModel(transport: PKMSAPITransport(session: session))
        model.serverAddress = "https://pkms.test"
        let workspace = PKMSWorkspace(id: workspaceID, repository: "owner/repo", branch: "main", revision: 4, githubStatus: "synced", message: nil, lastGitHubCommitAt: nil)
        model.activeWorkspace = workspace
        model.workspaces = [workspace]
        model.files = [oldFile]

        await model.reconcileWorkspaceAfterRealtimeSubscribe(workspaceID: workspaceID)

        XCTAssertEqual(model.files.map(\.id), ["new"], "Rejoining must replace missed tree state from the authoritative listing")
        XCTAssertEqual(model.activeWorkspace?.revision, 12)
        XCTAssertEqual(model.workspaces.first?.revision, 12)
    }
}

private final class PKMSURLProtocolGate: @unchecked Sendable {
    struct Reply: Sendable {
        let statusCode: Int
        let body: Data
    }

    let requestStarted: XCTestExpectation?
    let gatedPath: String?
    let replies: [String: Reply]
    let fallback: Reply
    let releaseResponse = DispatchSemaphore(value: 0)

    init(requestStarted: XCTestExpectation? = nil, gatedPath: String? = nil, replies: [String: Reply] = [:], fallback: Reply) {
        self.requestStarted = requestStarted
        self.gatedPath = gatedPath
        self.replies = replies
        self.fallback = fallback
    }

    func reply(for request: URLRequest) -> Reply {
        if request.url?.path == gatedPath {
            requestStarted?.fulfill()
            _ = releaseResponse.wait(timeout: .now() + 5)
        }
        return replies[request.url?.path ?? ""] ?? fallback
    }
}

private final class PKMSStubURLProtocol: URLProtocol {
    nonisolated(unsafe) private static var gate: PKMSURLProtocolGate?
    private static let gateLock = NSLock()

    static func install(_ gate: PKMSURLProtocolGate?) {
        gateLock.lock()
        self.gate = gate
        gateLock.unlock()
    }

    private static func currentGate() -> PKMSURLProtocolGate? {
        gateLock.lock()
        defer { gateLock.unlock() }
        return gate
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let gate = Self.currentGate() else { return }
        let reply = gate.reply(for: request)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: reply.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
