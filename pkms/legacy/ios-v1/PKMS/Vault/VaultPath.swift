import Foundation

/// A path relative to the vault root, using `/` separators (e.g. `Projects/project.md`).
///
/// Paths are the stable identity of files across the app. They map 1:1 to paths inside
/// the Git repository, so a future sync engine can talk about the same files without
/// translating identifiers.
struct VaultPath: Hashable, Sendable, Comparable, CustomStringConvertible {
    /// Normalized components; empty for the vault root.
    let components: [String]

    static let root = VaultPath(components: [])

    init(components: [String]) {
        self.components = components
    }

    /// Parses a `/`-separated path, resolving `.` and `..` segments. `..` never escapes the root.
    init(_ string: String) {
        var result: [String] = []
        for part in string.split(separator: "/", omittingEmptySubsequences: true) {
            switch part {
            case ".": continue
            case "..": _ = result.popLast()
            default: result.append(String(part))
            }
        }
        self.components = result
    }

    var isRoot: Bool { components.isEmpty }
    var string: String { components.joined(separator: "/") }
    var description: String { string }

    /// Last path component, including extension.
    var name: String { components.last ?? "" }

    /// Last path component without its extension.
    var baseName: String { (name as NSString).deletingPathExtension }

    var pathExtension: String { (name as NSString).pathExtension.lowercased() }

    var parent: VaultPath { VaultPath(components: Array(components.dropLast())) }

    func appending(_ string: String) -> VaultPath {
        VaultPath(components.isEmpty ? string : self.string + "/" + string)
    }

    /// Whether this path is `other` or inside it.
    func hasPrefix(_ other: VaultPath) -> Bool {
        components.starts(with: other.components)
    }

    /// Rewrites this path after `old` was moved to `new`, or returns `nil` if it isn't affected.
    func movingPrefix(_ old: VaultPath, to new: VaultPath) -> VaultPath? {
        guard hasPrefix(old) else { return nil }
        return VaultPath(components: new.components + components.dropFirst(old.components.count))
    }

    /// A `*.map` folder holding places; the app opens it as a map instead of browsing into it.
    var isMap: Bool { pathExtension == "map" }

    var isMarkdown: Bool { ["md", "markdown"].contains(pathExtension) }

    static func < (lhs: VaultPath, rhs: VaultPath) -> Bool {
        lhs.string.localizedStandardCompare(rhs.string) == .orderedAscending
    }
}
