import CryptoKit
import Foundation
import Network
import Observation
import Security

struct CodexCredentials: Codable {
    var clientID: String
    var hostID: String
    var accessToken: String
    var refreshToken: String
    var idToken: String
    var email: String
    var subject: String
    var accountID: String?
    var scopes: [String]
    var expiresAt: Date
}

enum CodexAuthError: LocalizedError {
    case listener(String), callback, state, registration, scope, identity, token(String)
    var errorDescription: String? {
        switch self {
        case .listener(let s): "Couldn’t start the ChatGPT sign-in callback: \(s)"
        case .callback: "ChatGPT sign-in didn’t return a valid authorization code."
        case .state: "ChatGPT sign-in state did not match. Please try again."
        case .registration: "ChatGPT did not return a registered client ID."
        case .scope: "Allow ChatGPT plan usage to use Codex in PKMS."
        case .identity: "Couldn’t verify the ChatGPT account identity."
        case .token(let s): s
        }
    }
}

/// OpenAI's documented public open-source client flow. OAuth secrets stay on device.
@MainActor
@Observable
final class CodexAuth {
    private(set) var credentials: CodexCredentials?
    private(set) var isSigningIn = false
    private(set) var didReceiveCallback = false
    private(set) var error: String?
    private var activeCallbackServer: CallbackServer?

    private static let service = (Bundle.main.bundleIdentifier ?? "pkms") + ".chatgpt-codex"
    private static let hostAccount = "host-id"
    private static let credentialsAccount = "credentials"
    private static let pendingClientAccount = "pending-client-id"
    private let urlSession = URLSession(configuration: .default)

    init() { credentials = Self.load() }

    var isSignedIn: Bool { credentials != nil }

    func chatGPTAccountID() throws -> String {
        guard let credentials else { throw CodexAuthError.identity }
        if let accountID = credentials.accountID, !accountID.isEmpty { return accountID }
        let parts = credentials.idToken.split(separator: ".")
        guard parts.count == 3,
              let payload = Self.decodeBase64URL(String(parts[1])),
              let claims = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let accountID = Self.accountID(in: claims) else { throw CodexAuthError.identity }
        return accountID
    }

    func signIn(openURL: @escaping (URL) -> Void) async {
        guard !isSigningIn else { return }
        isSigningIn = true
        didReceiveCallback = false
        error = nil
        defer { isSigningIn = false }
        do {
            let hostID = try Self.hostID()
            let callbackServer = CallbackServer()
            activeCallbackServer = callbackServer
            let callbackURL = try await callbackServer.start()
            let state = Self.randomToken()
            let nonce = Self.randomToken()
            let verifier = Self.randomToken(48)
            var components = URLComponents(string: "https://auth.openai.com/api/accounts/authorize")!
            let savedClientID = credentials?.clientID ?? Self.readKey(Self.pendingClientAccount)
            var items: [URLQueryItem] = [
                .init(name: "client_id", value: savedClientID ?? "dynamic_agent_client"),
                .init(name: "response_type", value: "code"),
                .init(name: "redirect_uri", value: callbackURL.absoluteString),
                .init(name: "scope", value: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"),
                .init(name: "resource", value: "https://api.openai.com/v1"),
                .init(name: "state", value: state),
                .init(name: "nonce", value: nonce),
                .init(name: "code_challenge_method", value: "S256"),
                .init(name: "code_challenge", value: Self.challenge(verifier)),
                .init(name: "ext_agent_host_id", value: hostID),
            ]
            if savedClientID == nil { items.append(.init(name: "agent_name_hint", value: "PKMS")) }
            if let idToken = credentials?.idToken { items.append(.init(name: "id_token_hint", value: idToken)) }
            components.queryItems = items
            guard let authorizeURL = components.url else { throw CodexAuthError.callback }
            openURL(authorizeURL)
            let callback = try await callbackServer.waitForCallback()
            didReceiveCallback = true
            guard callback.state == state else { throw CodexAuthError.state }
            if let oauthError = callback.error { throw CodexAuthError.token("ChatGPT sign-in failed: \(oauthError)") }
            guard let code = callback.code else { throw CodexAuthError.callback }
            let clientID: String
            if let savedClientID {
                if let callbackClientID = callback.clientID, callbackClientID != savedClientID {
                    throw CodexAuthError.registration
                }
                clientID = savedClientID
            } else if let registered = callback.clientID, !registered.isEmpty, registered != "dynamic_agent_client" {
                clientID = registered
                // Preserve the issued registration ID before exchanging the one-time code.
                try Self.writeKey(clientID, account: Self.pendingClientAccount)
            } else {
                throw CodexAuthError.registration
            }
            var value = try await exchange(code: code, verifier: verifier, callback: callbackURL, clientID: clientID)
            value.clientID = clientID
            value.hostID = hostID
            let identity = try await validateIdentity(value, nonce: nonce, clientID: clientID)
            value.subject = identity.subject
            value.email = identity.email
            value.accountID = identity.accountID
            guard value.scopes.contains("chatgpt.tokens.use.direct") else { throw CodexAuthError.scope }
            try Self.save(value)
            Self.deleteKey(Self.pendingClientAccount)
            credentials = value
        } catch is CancellationError {
        } catch { self.error = error.localizedDescription }
        activeCallbackServer = nil
    }

    func cancelSignIn() {
        activeCallbackServer?.cancel()
        activeCallbackServer = nil
        isSigningIn = false
    }

    func signOut() {
        Self.delete()
        credentials = nil
        error = nil
    }

    func accessToken() async throws -> String {
        guard var saved = credentials else { throw CodexAuthError.identity }
        if saved.expiresAt.timeIntervalSinceNow > 120 { return saved.accessToken }
        let body = ["grant_type": "refresh_token", "refresh_token": saved.refreshToken, "client_id": saved.clientID]
        let object = try await tokenRequest(body, operation: "ChatGPT token refresh")
        saved.accessToken = try Self.requiredString(object, "access_token")
        saved.refreshToken = (object["refresh_token"] as? String) ?? saved.refreshToken
        saved.expiresAt = Date().addingTimeInterval((object["expires_in"] as? Double) ?? 3600)
        if let raw = object["scope"] as? String { saved.scopes = raw.split(separator: " ").map(String.init) }
        guard saved.scopes.contains("chatgpt.tokens.use.direct") else { throw CodexAuthError.scope }
        try Self.save(saved)
        credentials = saved
        return saved.accessToken
    }

    private func exchange(code: String, verifier: String, callback: URL, clientID: String) async throws -> CodexCredentials {
        let object = try await tokenRequest([
            "grant_type": "authorization_code", "code": code, "code_verifier": verifier,
            "redirect_uri": callback.absoluteString, "client_id": clientID,
            "resource": "https://api.openai.com/v1",
        ], operation: "ChatGPT authorization-code exchange")
        let scopes = (object["scope"] as? String ?? "").split(separator: " ").map(String.init)
        return CodexCredentials(clientID: clientID, hostID: "", accessToken: try Self.requiredString(object, "access_token"),
                                refreshToken: try Self.requiredString(object, "refresh_token"),
                                idToken: try Self.requiredString(object, "id_token"), email: "", subject: "",
                                accountID: nil, scopes: scopes,
                                expiresAt: Date().addingTimeInterval((object["expires_in"] as? Double) ?? 3600))
    }

    private func tokenRequest(_ fields: [String: String], operation: String) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: "https://auth.openai.com/api/accounts/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = Self.formEncoded(fields)
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CodexAuthError.token("\(operation) failed: no HTTP response.")
        }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(http.statusCode), let object else {
            let code = object?["error"] as? String
            let message = (object?["error_description"] as? String)
                ?? (object?["message"] as? String)
            let detail = [code, message].compactMap { $0 }.joined(separator: ": ")
            throw CodexAuthError.token("\(operation) failed (HTTP \(http.statusCode))\(detail.isEmpty ? "." : ": \(detail)")")
        }
        return object
    }

    private func validateIdentity(_ value: CodexCredentials, nonce: String, clientID: String) async throws -> (subject: String, email: String, accountID: String?) {
        let parts = value.idToken.split(separator: ".")
        guard parts.count == 3,
              let payloadData = Self.decodeBase64URL(String(parts[1])),
              let claims = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
              claims["iss"] as? String == "https://auth.openai.com",
              (claims["aud"] as? String == clientID || (claims["aud"] as? [String])?.contains(clientID) == true),
              claims["nonce"] as? String == nonce,
              let subject = claims["sub"] as? String,
              let expiration = claims["exp"] as? Double, expiration > Date().timeIntervalSince1970 else {
            throw CodexAuthError.identity
        }
        let jwksURL = URL(string: "https://auth.openai.com/.well-known/jwks.json")!
        let (jwksData, _) = try await urlSession.data(from: jwksURL)
        guard let jwks = try JSONSerialization.jsonObject(with: jwksData) as? [String: Any],
              let keys = jwks["keys"] as? [[String: Any]],
              let headerData = Self.decodeBase64URL(String(parts[0])),
              let header = try JSONSerialization.jsonObject(with: headerData) as? [String: Any],
              header["alg"] as? String == "ES256",
              let kid = header["kid"] as? String,
              let key = keys.first(where: { $0["kid"] as? String == kid && $0["kty"] as? String == "EC" }),
              let x = key["x"] as? String, let y = key["y"] as? String,
              let xData = Self.decodeBase64URL(x), let yData = Self.decodeBase64URL(y),
              let signature = Self.decodeBase64URL(String(parts[2])),
              let publicKey = try? P256.Signing.PublicKey(x963Representation: Data([4]) + xData + yData),
              let signed = try? P256.Signing.ECDSASignature(rawRepresentation: signature),
              publicKey.isValidSignature(signed, for: Data("\(parts[0]).\(parts[1])".utf8)) else {
            throw CodexAuthError.identity
        }
        if let active = credentials, active.clientID == clientID, active.subject != subject {
            throw CodexAuthError.identity
        }
        // Credentials are replaced only after the signed subject and nonce are verified.
        return (subject, claims["email"] as? String ?? "", Self.accountID(in: claims))
    }

    private static func accountID(in claims: [String: Any]) -> String? {
        if let value = claims["chatgpt_account_id"] as? String, !value.isEmpty { return value }
        let authClaims = claims["https://api.openai.com/auth"] as? [String: Any]
        return (authClaims?["chatgpt_account_id"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    private static func requiredString(_ object: [String: Any], _ key: String) throws -> String {
        guard let value = object[key] as? String, !value.isEmpty else { throw CodexAuthError.identity }; return value
    }
    private static func formEncoded(_ fields: [String: String]) -> Data {
        let body = fields.keys.sorted().map { key in "\(formEncoded(key))=\(formEncoded(fields[key]!))" }.joined(separator: "&")
        return Data(body.utf8)
    }
    private static func formEncoded(_ value: String) -> String {
        value.utf8.map { byte in
            switch byte {
            case 0x41...0x5A, 0x61...0x7A, 0x30...0x39, 0x2A, 0x2D, 0x2E, 0x5F:
                return String(UnicodeScalar(byte))
            case 0x20: return "+"
            default: return String(format: "%%%02X", byte)
            }
        }.joined()
    }
    private static func randomToken(_ count: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: count); _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    private static func challenge(_ verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    private static func decodeBase64URL(_ value: String) -> Data? {
        var s = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        s += String(repeating: "=", count: (4 - s.count % 4) % 4); return Data(base64Encoded: s)
    }
    private static func hostID() throws -> String {
        if let existing = readKey(hostAccount), !existing.isEmpty { return existing }
        let value = "urn:uuid:\(UUID().uuidString.lowercased())"; try writeKey(value, account: hostAccount); return value
    }
    private static func load() -> CodexCredentials? {
        guard let data = readData(credentialsAccount) else { return nil }; return try? JSONDecoder().decode(CodexCredentials.self, from: data)
    }
    private static func save(_ credentials: CodexCredentials) throws { try writeData(JSONEncoder().encode(credentials), account: credentialsAccount) }
    private static func delete() {
        // Keep the stable host identity across sign-outs/account switches, as required by the
        // ChatGPT plan-usage session flow. Tokens and any incomplete registration are removed.
        for account in [credentialsAccount, pendingClientAccount] { deleteKey(account) }
    }
    private static func deleteKey(_ account: String) { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary) }
    private static func readKey(_ account: String) -> String? { guard let data = readData(account) else { return nil }; return String(data: data, encoding: .utf8) }
    private static func readData(_ account: String) -> Data? {
        var result: CFTypeRef?; let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }; return result as? Data
    }
    private static func writeKey(_ value: String, account: String) throws { try writeData(Data(value.utf8), account: account) }
    private static func writeData(_ data: Data, account: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let values: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound { var add = query; values.forEach { add[$0.key] = $0.value }; guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { throw CodexAuthError.identity } }
        else if status != errSecSuccess { throw CodexAuthError.identity }
    }
}

private struct OAuthCallback { let code: String?; let state: String?; let clientID: String?; let error: String? }

private final class CallbackServer: @unchecked Sendable {
    private var listener: NWListener?
    private var continuation: CheckedContinuation<OAuthCallback, Error>?
    private var readyContinuation: CheckedContinuation<Void, Error>?
    private var pendingCallback: Result<OAuthCallback, Error>?
    private let queue = DispatchQueue(label: "pkms.chatgpt.oauth")
    func start() async throws -> URL {
        let listener: NWListener
        do { listener = try NWListener(using: .tcp, on: 1455) } catch { throw CodexAuthError.listener(error.localizedDescription) }
        self.listener = listener
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            readyContinuation = c
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready: self.readyContinuation?.resume(); self.readyContinuation = nil
                case .failed(let error): self.readyContinuation?.resume(throwing: CodexAuthError.listener(error.localizedDescription)); self.readyContinuation = nil
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in self?.receive(connection) }
            listener.start(queue: queue)
        }
        return URL(string: "http://127.0.0.1:1455/auth/callback")!
    }
    func waitForCallback() async throws -> OAuthCallback {
        if let pendingCallback { self.pendingCallback = nil; return try pendingCallback.get() }
        return try await withCheckedThrowingContinuation { continuation = $0 }
    }
    func cancel() {
        listener?.cancel()
        listener = nil
        continuation?.resume(throwing: CancellationError())
        continuation = nil
    }
    private func receive(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8),
                  let line = request.components(separatedBy: "\r\n").first,
                  let target = line.split(separator: " ").dropFirst().first,
                  let components = URLComponents(string: "http://127.0.0.1\(target)"), components.path == "/auth/callback" else { return }
            let query = Dictionary(components.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { first, _ in first })
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<html><body><h2>PKMS sign-in complete</h2><p>Return to PKMS.</p></body></html>"
            connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
            self.listener?.cancel()
            self.listener = nil
            let callback = OAuthCallback(code: query["code"], state: query["state"], clientID: query["client_id"], error: query["error"])
            if let continuation = self.continuation {
                continuation.resume(returning: callback)
                self.continuation = nil
            } else {
                self.pendingCallback = .success(callback)
            }
        }
    }
}
