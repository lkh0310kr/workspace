import Foundation

/// Applies the connected PKMS vault's root `.aiignore` before agent tools can expose notes.
enum AgentDataPolicy {
    static let configPath = VaultPath(".aiignore")

    /// Used only until the connected vault's `.aiignore` has synced onto this device.
    static let fallbackRules = """
    # Personal source documents: school records and original scans
    대학/자료/*학교생활기록부*
    대학/자료/*_원본.pdf
    # Common credentials and private areas
    .env
    .env.*
    **/.env
    **/.env.*
    Private/
    **/Private/
    Secrets/
    **/Secrets/
    Credentials/
    **/Credentials/
    Tokens/
    **/Tokens/
    *password*
    *credential*
    *secret*
    *.pem
    *.key
    *.p12
    *.pfx
    """

    private static let previousGeneratedRules = """
    # Keep common credentials and explicitly private folders out of agent context.
    .env
    .env.*
    **/.env
    **/.env.*
    Private/**
    **/Private/**
    Secrets/**
    **/Secrets/**
    Credentials/**
    **/Credentials/**
    Tokens/**
    **/Tokens/**
    *password*
    *credential*
    *secret*
    *.pem
    *.key
    *.p12
    *.pfx
    """

    static func readRules(from repository: any VaultRepository) async throws -> String {
        guard repository.exists(configPath) else { return fallbackRules }
        let current = try await repository.readText(at: configPath)
        if current.trimmingCharacters(in: .whitespacesAndNewlines) == previousGeneratedRules.trimmingCharacters(in: .whitespacesAndNewlines) {
            return fallbackRules
        }
        return current
    }

    @MainActor
    static func prepareFileIfNeeded(in store: VaultStore) async {
        do {
            if !store.repository.exists(configPath) {
                try store.save(fallbackRules, to: configPath)
                return
            }
            let current = try await store.repository.readText(at: configPath)
            if current.trimmingCharacters(in: .whitespacesAndNewlines) == previousGeneratedRules.trimmingCharacters(in: .whitespacesAndNewlines) {
                try store.save(fallbackRules, to: configPath)
            }
        } catch {
            // The agent still uses the built-in rules if the local config cannot be prepared.
        }
    }

    static func excludes(_ path: VaultPath, rules: String) -> Bool {
        var ignored = false
        for rawLine in rules.split(whereSeparator: \.isNewline) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty, !line.hasPrefix("#") else { continue }
            let negated = line.hasPrefix("!")
            let pattern = negated ? String(line.dropFirst()) : line
            if matches(path.string, pattern: pattern) { ignored = !negated }
        }
        return ignored
    }

    private static func matches(_ path: String, pattern rawPattern: String) -> Bool {
        var pattern = rawPattern
        var anchored = false
        if pattern.hasPrefix("/") {
            anchored = true
            pattern.removeFirst()
        }
        let directoryOnly = pattern.hasSuffix("/")
        if directoryOnly { pattern.removeLast() }
        guard !pattern.isEmpty else { return false }

        let hasSlash = pattern.contains("/")
        var expression = globRegex(pattern)
        if !anchored && !hasSlash { expression = "(?:^|/)" + expression }
        // Directory rules cover every descendant of the matching directory.
        expression += directoryOnly ? "(?:/.*)?$" : "(?:$|/.*$)"
        guard let regex = try? NSRegularExpression(pattern: expression) else { return false }
        return regex.firstMatch(in: path, range: NSRange(path.startIndex..<path.endIndex, in: path)) != nil
    }

    private static func globRegex(_ pattern: String) -> String {
        var result = ""
        var index = pattern.startIndex
        while index < pattern.endIndex {
            let character = pattern[index]
            if character == "*" {
                let next = pattern.index(after: index)
                if next < pattern.endIndex, pattern[next] == "*" {
                    let afterPair = pattern.index(after: next)
                    if afterPair < pattern.endIndex, pattern[afterPair] == "/" {
                        result += "(?:.*/)?"
                        index = pattern.index(after: afterPair)
                    } else {
                        result += ".*"
                        index = afterPair
                    }
                } else {
                    result += "[^/]*"
                    index = next
                }
            } else if character == "?" {
                result += "[^/]"
                index = pattern.index(after: index)
            } else {
                result += NSRegularExpression.escapedPattern(for: String(character))
                index = pattern.index(after: index)
            }
        }
        return result
    }
}
