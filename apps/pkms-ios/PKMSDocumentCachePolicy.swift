enum PKMSDocumentCachePolicy {
    static let recentLimit = 20

    static func recentKeys(afterAdding key: String, to recent: [String]) -> [String] {
        [key] + recent.filter { $0 != key }
    }

    static func evictionCandidates(recent: [String], pending: Set<String>) -> [String] {
        recent.dropFirst(recentLimit).filter { !pending.contains($0) }
    }

    static func retainedKeys(afterAdding key: String, to recent: [String], pending: Set<String>) -> [String] {
        let ordered = recentKeys(afterAdding: key, to: recent + pending.sorted())
        let protected = ordered.filter { pending.contains($0) }
        let clean = ordered.filter { !pending.contains($0) }.prefix(recentLimit)
        return Array(clean) + protected
    }

    static func canClearPendingAfterIncrementalSave(
        requestGeneration: UInt64,
        currentGeneration: UInt64,
        isFinalUpdate: Bool,
        requiresFullState: Bool
    ) -> Bool {
        isFinalUpdate && requestGeneration == currentGeneration && !requiresFullState
    }
}
