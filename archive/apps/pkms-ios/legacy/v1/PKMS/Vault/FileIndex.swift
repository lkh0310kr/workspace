import Foundation

/// A file or folder in the vault.
struct VaultNode: Identifiable, Hashable, Sendable {
    enum Kind: Sendable { case folder, markdown, asset, map }

    let path: VaultPath
    let kind: Kind
    /// Direct children, sorted folders-first. Empty for files.
    var children: [VaultNode] = []

    var id: VaultPath { path }
    var name: String { path.name }

    /// Name shown in the UI: Markdown files and maps drop their extension.
    var displayName: String {
        if path.isRoot { return "Vault" }
        return kind == .markdown || kind == .map ? path.baseName : path.name
    }

    var isFolder: Bool { kind == .folder }

    /// Whether the node appears in the file browser: documents, and folders that are empty
    /// or contain documents. Asset-only folders (e.g. `Assets/`) are hidden.
    var isBrowsable: Bool {
        switch kind {
        case .markdown, .map: true
        case .asset: false
        case .folder: children.isEmpty || children.contains { $0.isBrowsable }
        }
    }
}

/// An in-memory snapshot of the vault's file tree plus lookup tables used for
/// navigation, link resolution and filename search.
///
/// The index is always derived from the files on disk and can be rebuilt at any time;
/// it is never the source of truth.
struct FileIndex: Sendable {
    let root: VaultNode
    private let nodesByPath: [VaultPath: VaultNode]
    /// Lowercased file name (with and without extension) → paths, for Obsidian-style lookup.
    private let pathsByName: [String: [VaultPath]]

    static let empty = FileIndex(root: VaultNode(path: .root, kind: .folder))

    init(root: VaultNode) {
        self.root = root
        var byPath: [VaultPath: VaultNode] = [:]
        var byName: [String: [VaultPath]] = [:]
        func visit(_ node: VaultNode) {
            byPath[node.path] = node
            if node.kind != .folder {
                byName[node.name.lowercased(), default: []].append(node.path)
                if node.kind == .markdown {
                    byName[node.path.baseName.lowercased(), default: []].append(node.path)
                }
            }
            node.children.forEach(visit)
        }
        visit(root)
        self.nodesByPath = byPath
        // Prefer shorter (shallower) paths when several files share a name, like Obsidian.
        self.pathsByName = byName.mapValues { $0.sorted { ($0.components.count, $0) < ($1.components.count, $1) } }
    }

    func node(at path: VaultPath) -> VaultNode? { nodesByPath[path] }

    var markdownFiles: [VaultNode] {
        nodesByPath.values.filter { $0.kind == .markdown }.sorted { $0.path < $1.path }
    }

    /// Filename search over Markdown documents.
    func search(_ query: String) -> [VaultNode] {
        let query = query.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return [] }
        return markdownFiles.filter { $0.path.string.localizedStandardContains(query) }
    }

    /// Resolves a link target found in a document.
    ///
    /// - Wiki targets (`[[Page Name]]`, `![[image.png]]`) are matched by file name anywhere in the vault,
    ///   then as a vault-relative path.
    /// - Regular targets (`Notes/note.md`, `../Assets/a.png`) are resolved relative to the
    ///   linking document's folder, falling back to the vault root.
    func resolve(_ target: String, from document: VaultPath, isWikiLink: Bool) -> VaultPath? {
        let target = (target.removingPercentEncoding ?? target)
            .components(separatedBy: "#").first!   // drop heading anchors
            .trimmingCharacters(in: .whitespaces)
        guard !target.isEmpty else { return nil }

        if isWikiLink {
            if let match = pathsByName[target.lowercased()]?.first { return match }
            for candidate in [VaultPath(target), VaultPath(target + ".md")] where nodesByPath[candidate] != nil {
                return candidate
            }
            return nil
        }

        let isAbsolute = target.hasPrefix("/")
        var candidates = [isAbsolute ? VaultPath(target) : document.parent.appending(target)]
        if !isAbsolute { candidates.append(VaultPath(target)) }
        for candidate in candidates {
            if nodesByPath[candidate] != nil { return candidate }
            let withExtension = VaultPath(candidate.string + ".md")
            if candidate.pathExtension.isEmpty, nodesByPath[withExtension] != nil { return withExtension }
        }
        // Last resort: match by bare file name, which handles moved assets.
        return pathsByName[VaultPath(target).name.lowercased()]?.first
    }
}
