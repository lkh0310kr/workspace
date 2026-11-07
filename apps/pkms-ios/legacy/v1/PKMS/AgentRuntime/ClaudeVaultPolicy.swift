import Foundation

/// Converts the vault's `.aiignore` into Claude Code's native file permission denies.
/// This is a CLI policy layer, not an operating-system sandbox: arbitrary scripts may
/// still bypass Claude Code's built-in file tools and permission checks.
enum ClaudeVaultPolicy {
    static func writeSettings(vaultRoot: URL, home: URL, rules: String) throws -> URL {
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        try protectPrivateDirectory(home)
        let root = vaultRoot.standardizedFileURL
        var denied = Set<String>()
        // Do not let Claude read the policy file itself unless explicitly requested later.
        addRules(for: root.appending(path: ".aiignore"), isDirectory: false, to: &denied)
        // The native chat UI does not expose a shell-command approval surface.
        denied.insert("Bash")

        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
            options: []
        ) else {
            throw CocoaError(.fileReadNoSuchFile, userInfo: [NSFilePathErrorKey: root.path])
        }

        for case let item as URL in enumerator {
            let name = item.lastPathComponent
            let values = try? item.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            if values?.isSymbolicLink == true {
                addRules(for: item, isDirectory: values?.isDirectory == true, to: &denied)
                enumerator.skipDescendants()
                continue
            }
            if [".git", ".obsidian", ".trash", ".DS_Store"].contains(name) {
                if values?.isDirectory == true {
                    enumerator.skipDescendants()
                }
                continue
            }
            let itemPath = item.standardizedFileURL.path
            let prefix = root.path.hasSuffix("/") ? root.path : root.path + "/"
            guard itemPath.hasPrefix(prefix) else { continue }
            let relative = String(itemPath.dropFirst(prefix.count))
            guard !relative.isEmpty else { continue }
            let path = VaultPath(relative)
            let isDirectory = values?.isDirectory == true
            if AgentDataPolicy.excludes(path, rules: rules) {
                addRules(for: item, isDirectory: isDirectory, to: &denied)
                if isDirectory { enumerator.skipDescendants() }
            }
        }

        let config = home.appending(path: ".claude", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: config, withIntermediateDirectories: true)
        try protectPrivateDirectory(config)
        let settingsURL = config.appending(path: "pkms-settings.json")
        let settings: [String: Any] = [
            "permissions": [
                "allow": ["Read", "Edit", "Write", "Glob", "Grep"],
                "deny": denied.sorted(),
            ],
        ]
        let data = try JSONSerialization.data(withJSONObject: settings, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: settingsURL, options: .atomic)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: settingsURL.path)
        try excludeFromBackup(settingsURL)
        return settingsURL
    }

    private static func protectPrivateDirectory(_ url: URL) throws {
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        try excludeFromBackup(url)
    }

    private static func excludeFromBackup(_ url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableURL = url
        try mutableURL.setResourceValues(values)
    }

    private static func addRules(for url: URL, isDirectory: Bool, to denied: inout Set<String>) {
        let path = url.standardizedFileURL.path
        // Claude's permission syntax uses // to anchor a path at the filesystem root.
        let glob = "//" + String(path.dropFirst()) + (isDirectory ? "/**" : "")
        denied.insert("Read(\(glob))")
        denied.insert("Edit(\(glob))")
        denied.insert("Write(\(glob))")
    }
}
