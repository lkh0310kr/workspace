import Foundation
import os
import Security

/// Request log for GitHub sign-in and sync. Tokens and device codes are never written.
enum GitHubLog {
    private static let logger = Logger(subsystem: "com.lkh0310kr.pkms", category: "github")
    private static let gate = LogGate()
    static let fileURL = URL.applicationSupportDirectory.appending(path: "github.log")

    static func info(_ message: String) { record(message, error: false) }
    static func error(_ message: String) { record(message, error: true) }

    private static func record(_ message: String, error: Bool) {
        if error {
            logger.error("\(message, privacy: .public)")
        } else {
            logger.info("\(message, privacy: .public)")
        }
        gate.append(message)
    }
}

private final class LogGate: @unchecked Sendable {
    private let lock = NSLock()

    func append(_ message: String) {
        lock.lock()
        defer { lock.unlock() }
        let url = GitHubLog.fileURL
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let line = Data("\(Date.now.formatted(.iso8601)) \(message)\n".utf8)
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: line)
        } else {
            try? line.write(to: url)
        }
    }
}

extension URLError {
    /// Dropped connections and brief reachability failures. Safe to retry for reads and device-code polling.
    var isTransient: Bool {
        switch code {
        case .networkConnectionLost, .timedOut, .cannotConnectToHost, .cannotFindHost,
             .dnsLookupFailed, .notConnectedToInternet, .internationalRoamingOff,
             .callIsActive, .dataNotAllowed:
            true
        default:
            false
        }
    }
}

struct GitHubTransportError: LocalizedError {
    var method: String
    var url: URL
    var underlying: Error

    var isTransient: Bool { (underlying as? URLError)?.isTransient == true }

    var errorDescription: String? {
        "\(method) \(url.host ?? "")\(url.path): \(underlying.localizedDescription)"
    }
}

enum GitHubAppConfig {
    /// Client ID of the GitHub App used for "Sign in with GitHub" (Device Flow).
    /// Register one at https://github.com/settings/apps/new, enable Device Flow, grant
    /// Contents: Read and write, and paste its Client ID here. Client IDs are public;
    /// no client secret is needed. While empty, the app offers personal access token sign-in only.
    static let clientID = "Iv23liraL0HMfTJQUhsT"

    /// Where the user installs the app on their account and chooses which repositories it can see.
    static let installURL = URL(string: "https://github.com/apps/pkms-client/installations/new")!

    /// Refresh an access token this long before GitHub expires it (user tokens last 8 hours).
    static let refreshLeeway: TimeInterval = 5 * 60
}

/// Access token plus the refresh token GitHub Apps return. A personal access token has neither
/// expiry nor refresh token; those stay nil and are used as-is until GitHub rejects them.
struct GitHubCredentials: Codable, Sendable, Equatable {
    var accessToken: String
    var refreshToken: String?
    var accessExpiresAt: Date?
    var refreshExpiresAt: Date?

    /// True when a refresh token can still mint a new access token.
    var refreshTokenIsUsable: Bool {
        guard let refreshToken, !refreshToken.isEmpty else { return false }
        if let refreshExpiresAt { return refreshExpiresAt.timeIntervalSinceNow > 0 }
        return true
    }

    /// True shortly before the access token expires, so requests aren't sent with a token about to die.
    var needsRefresh: Bool {
        guard refreshTokenIsUsable, let accessExpiresAt else { return false }
        return accessExpiresAt.timeIntervalSinceNow < GitHubAppConfig.refreshLeeway
    }
}

/// GitHub App Device Flow: the app shows a short code, the user approves it on github.com,
/// and the app polls until GitHub issues an access token and a refresh token.
/// https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
struct GitHubDeviceFlow: Sendable {
    struct DeviceCode: Decodable, Sendable, Equatable {
        let deviceCode: String
        let userCode: String
        let verificationUri: URL
        let expiresIn: Int
        let interval: Int
    }

    enum FlowError: LocalizedError {
        case expired
        case denied
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .expired: "The sign-in code expired. Try again."
            case .denied: "Sign-in was canceled on GitHub."
            case .failed(let message): message
            }
        }
    }

    let clientID: String
    var session: URLSession = .shared

    func start() async throws -> DeviceCode {
        // Permissions come from the GitHub App, so this request has no OAuth scope.
        try await retryingTransient {
            try await post("https://github.com/login/device/code", ["client_id": clientID])
        }
    }

    /// Polls until the user approves the code. Cancel the calling task to stop waiting.
    func waitForToken(_ code: DeviceCode) async throws -> GitHubCredentials {
        var interval = max(code.interval, 5)
        let deadline = Date.now.addingTimeInterval(TimeInterval(code.expiresIn))
        while Date.now < deadline {
            try await Task.sleep(for: .seconds(interval))
            let response: TokenResponse
            do {
                response = try await post(Self.tokenURL, [
                    "client_id": clientID,
                    "device_code": code.deviceCode,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                ])
            } catch let error as GitHubTransportError where error.isTransient {
                GitHubLog.info("device poll will retry: \(error.localizedDescription)")
                continue
            }
            if let credentials = response.credentials { return credentials }
            switch response.error {
            case "authorization_pending": continue
            case "slow_down": interval = response.interval ?? interval + 5
            case "expired_token": throw FlowError.expired
            case "access_denied": throw FlowError.denied
            default: throw FlowError.failed(response.errorDescription ?? response.error ?? "Sign-in failed.")
            }
        }
        throw FlowError.expired
    }

    /// Exchanges a refresh token for a new access token. GitHub also rotates the refresh token;
    /// the caller must store the credentials this returns. Device-flow tokens need no client secret.
    func refresh(_ refreshToken: String) async throws -> GitHubCredentials {
        let response: TokenResponse = try await post(Self.tokenURL, [
            "client_id": clientID,
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
        ])
        guard let credentials = response.credentials else { throw GitHubError.unauthorized }
        return credentials
    }

    private static let tokenURL = "https://github.com/login/oauth/access_token"

    private struct TokenResponse: Decodable {
        let accessToken: String?
        let expiresIn: Int?
        let refreshToken: String?
        let refreshTokenExpiresIn: Int?
        let error: String?
        let errorDescription: String?
        let interval: Int?

        var credentials: GitHubCredentials? {
            guard let accessToken, !accessToken.isEmpty else { return nil }
            return GitHubCredentials(
                accessToken: accessToken,
                refreshToken: refreshToken,
                accessExpiresAt: expiresIn.map { Date.now.addingTimeInterval(TimeInterval($0)) },
                refreshExpiresAt: refreshTokenExpiresIn.map { Date.now.addingTimeInterval(TimeInterval($0)) }
            )
        }
    }

    /// Retries a dropped connection. Not used for refresh: GitHub rotates the refresh token even if the response is lost.
    private func retryingTransient<T>(_ operation: () async throws -> T) async throws -> T {
        var last: Error?
        for attempt in 0..<3 {
            do { return try await operation() } catch let error as GitHubTransportError where error.isTransient {
                last = error
                GitHubLog.info("retry \(attempt + 1): \(error.localizedDescription)")
                try await Task.sleep(for: .milliseconds(400 * (attempt + 1)))
            }
        }
        throw last!
    }

    private func post<T: Decodable>(_ urlString: String, _ form: [String: String]) async throws -> T {
        let url = URL(string: urlString)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var components = URLComponents()
        components.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = Data((components.percentEncodedQuery ?? "").utf8)
        let keys = form.keys.sorted().joined(separator: ",")
        GitHubLog.info("POST \(url.host ?? "")\(url.path) fields=\(keys)")
        let data: Data
        let status: Int
        do {
            let (body, response) = try await session.data(for: request)
            data = body
            status = (response as? HTTPURLResponse)?.statusCode ?? -1
        } catch {
            GitHubLog.error("POST \(url.host ?? "")\(url.path) \((error as NSError).domain) \((error as NSError).code) \(error.localizedDescription)")
            throw GitHubTransportError(method: "POST", url: url, underlying: error)
        }
        GitHubLog.info("POST \(url.path) -> \(status) \(data.count) bytes")
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let snippet = String(decoding: data.prefix(180), as: UTF8.self)
            GitHubLog.error("POST \(url.path) decode failed: \(snippet)")
            throw GitHubTransportError(method: "POST", url: url, underlying: error)
        }
    }
}

/// Holds the signed-in credentials and refreshes them. Refresh calls share one in-flight request
/// so two syncs can't rotate the refresh token out from under each other.
actor GitHubAccount {
    typealias Refresh = @Sendable (String) async throws -> GitHubCredentials

    private var credentials: GitHubCredentials?
    /// Bumped on sign-in and sign-out so a refresh that finishes late can't restore a signed-out session.
    private var ticket = 0
    private var inflight: Task<GitHubCredentials, Error>?
    private let persist: Bool
    private let refreshHandler: Refresh

    init(credentials: GitHubCredentials? = nil, persist: Bool = true, refresh: Refresh? = nil) {
        self.credentials = credentials
        self.persist = persist
        self.refreshHandler = refresh ?? { token in
            try await GitHubDeviceFlow(clientID: GitHubAppConfig.clientID).refresh(token)
        }
    }

    func replace(_ credentials: GitHubCredentials, ticket: Int) {
        self.ticket = ticket
        self.credentials = credentials
        if persist { TokenStore.save(credentials) }
    }

    /// Drops the session only if `expected` is still the current sign-in, so a sign-out that
    /// races a new sign-in doesn't delete the new token.
    func clear(ticket expected: Int) {
        guard ticket == expected else { return }
        ticket += 1
        credentials = nil
        inflight?.cancel()
        inflight = nil
        if persist { TokenStore.delete() }
    }

    func accessToken() async throws -> String {
        guard let credentials else { throw GitHubError.unauthorized }
        if credentials.needsRefresh {
            return try await refreshed().accessToken
        }
        return credentials.accessToken
    }

    /// Called after GitHub returns 401. If another request already rotated the token, reuse that.
    func refreshAfterUnauthorized(rejected token: String) async throws -> String {
        if let credentials, credentials.accessToken != token, !credentials.needsRefresh {
            return credentials.accessToken
        }
        return try await refreshed().accessToken
    }

    private func refreshed() async throws -> GitHubCredentials {
        if let inflight { return try await inflight.value }
        guard let refreshToken = credentials?.refreshToken, credentials?.refreshTokenIsUsable == true else {
            throw GitHubError.unauthorized
        }
        let ticketAtStart = ticket
        let task = Task { try await refreshHandler(refreshToken) }
        inflight = task
        defer { inflight = nil }
        do {
            let updated = try await task.value
            guard ticket == ticketAtStart else { throw CancellationError() }
            credentials = updated
            if persist { TokenStore.save(updated) }
            return updated
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as GitHubError where error == .unauthorized {
            if ticket == ticketAtStart {
                credentials = nil
                if persist { TokenStore.delete() }
            }
            throw error
        }
    }
}

/// Stores GitHub credentials in the Keychain (never in UserDefaults or the vault).
enum TokenStore {
    private static let service = (Bundle.main.bundleIdentifier ?? "pkms") + ".github"
    private static let account = "access-token"

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func read() -> GitHubCredentials? {
        var item: CFTypeRef?
        var query = query
        query[kSecReturnData as String] = true
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return credentials(from: data)
    }

    /// JSON credentials, or a legacy Keychain entry that stored the access token as plain text.
    static func credentials(from data: Data) -> GitHubCredentials? {
        if let credentials = try? JSONDecoder().decode(GitHubCredentials.self, from: data),
           !credentials.accessToken.isEmpty {
            return credentials
        }
        guard let token = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty else { return nil }
        return GitHubCredentials(accessToken: token)
    }

    static func save(_ credentials: GitHubCredentials) {
        delete()
        guard let data = try? JSONEncoder().encode(credentials) else { return }
        var query = query
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
