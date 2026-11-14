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
