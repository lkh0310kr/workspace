import Foundation

@main
struct DocumentCachePolicyTests {
    static func main() {
        let pending = Set(["w/dirty-old", "w/dirty-current", "w/dirty-unlisted"])
        let oldFiles = (1...25).map { "w/clean-\($0)" }
        let recent = oldFiles + ["w/dirty-old"]
        let updated = PKMSDocumentCachePolicy.retainedKeys(afterAdding: "w/dirty-current", to: recent, pending: pending)
        let retained = Set(updated)

        precondition(retained.contains("w/dirty-old"), "Dirty cache outside the recent window was evicted")
        precondition(retained.contains("w/dirty-current"), "Current dirty cache was not retained")
        precondition(retained.contains("w/dirty-unlisted"), "Pending cache missing from the recent index was not recovered")
        precondition(updated.filter { !pending.contains($0) }.count == PKMSDocumentCachePolicy.recentLimit,
                     "Clean cache retention should be bounded by the recent limit")
        let afterAck = PKMSDocumentCachePolicy.retainedKeys(
            afterAdding: "w/dirty-old",
            to: updated,
            pending: pending.subtracting(["w/dirty-old"])
        )
        precondition(afterAck.first == "w/dirty-old", "Acknowledged cache was not made most recent")
        precondition(afterAck.filter { !pending.subtracting(["w/dirty-old"]).contains($0) }.count == PKMSDocumentCachePolicy.recentLimit,
                     "Clean cache count was not trimmed after acknowledgement")

        precondition(PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 4,
            currentGeneration: 4,
            isFinalUpdate: true,
            requiresFullState: false
        ), "Latest acknowledged final update should clear pending state")
        precondition(!PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 3,
            currentGeneration: 4,
            isFinalUpdate: true,
            requiresFullState: false
        ), "Stale acknowledgement must not clear pending state")
        precondition(!PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 4,
            currentGeneration: 4,
            isFinalUpdate: true,
            requiresFullState: true
        ), "Failed/offline document requiring full state must remain pending")
        precondition(!PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
            requestGeneration: 4,
            currentGeneration: 4,
            isFinalUpdate: false,
            requiresFullState: false
        ), "Intermediate update acknowledgement must not clear pending state")

        print("iOS document cache policy: 10 assertions passed")
    }
}
