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
        let gate = PKMSURLProtocolGate(requestStarted: requestStarted)
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
}

private final class PKMSURLProtocolGate: @unchecked Sendable {
    let requestStarted: XCTestExpectation
    let releaseResponse = DispatchSemaphore(value: 0)

    init(requestStarted: XCTestExpectation) {
        self.requestStarted = requestStarted
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
        gate.requestStarted.fulfill()
        _ = gate.releaseResponse.wait(timeout: .now() + 5)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 429,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"error":"rate_limited"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
