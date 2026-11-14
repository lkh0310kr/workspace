import Foundation
import Observation
import OSLog
import Supabase
import UniformTypeIdentifiers

@MainActor
@Observable
final class PKMSModel {
    private let authLogger = Logger(subsystem: "com.pkms.client", category: "auth")
    var serverAddress: String {
        didSet { UserDefaults.standard.set(serverAddress, forKey: "pkms.serverAddress") }
    }
    internal(set) var user: PKMSUser?
    internal(set) var workspaces: [PKMSWorkspace] = []
    internal(set) var repositories: [PKMSRepository] = []
    internal(set) var files: [PKMSFile] = []
    internal(set) var searchResults: [PKMSSearchResult] = []
    internal(set) var searchResponse: PKMSSearchResponse?
    internal(set) var isSearching = false
    internal(set) var activeWorkspace: PKMSWorkspace?
    internal(set) var activeFile: PKMSFile?
    internal(set) var activeFolderPath: String?
    internal(set) var markdown = ""
    internal(set) var githubStatus = "synced"
    internal(set) var pendingFiles = 0
    internal(set) var statusMessage = ""
    internal(set) var errorMessage: String?
    internal(set) var deviceCode: String?
    internal(set) var verificationURL: URL?
    internal(set) var isLoading = false
    internal(set) var isRestoringSession = true
    internal(set) var isSigningIn = false
    internal(set) var previewURL: URL?
    internal(set) var collaborators: [PKMSPeer] = []

    var token: String?
    var document: NativeMarkdownDocument?
    var realtimeClient: SupabaseClient?
    var realtimeChannel: RealtimeChannelV2?
    var realtimeSubscriptions: [RealtimeSubscription] = []
    var realtimeTokenTask: Task<Void, Never>?
    var socketTask: Task<Void, Never>?
    var deviceTask: Task<Void, Never>?
    var cacheTask: Task<Void, Never>?
    var flushTask: Task<Void, Never>?
    var clientID = "ios-\(UUID().uuidString.lowercased())"
    internal(set) var expandedFolders: Set<String> = [""]
    private let transport = PKMSAPITransport()

    init() {
        let savedAddress = UserDefaults.standard.string(forKey: "pkms.serverAddress")
        if let savedAddress, !savedAddress.contains("localhost"), !savedAddress.contains("127.0.0.1") {
            serverAddress = savedAddress
        } else {
            serverAddress = "https://pkms-cloud.lkh0310kr.workers.dev"
        }
        token = SessionVault.read(for: serverAddress)
    }

    func restoreSession() async {
        defer { isRestoringSession = false }
        guard token != nil else { return }
        do {
            let session = try await get("/api/session", as: PKMSSessionResponse.self)
            user = session.user
            if user != nil { await loadWorkspaces() } else { await signOut() }
        } catch { errorMessage = error.localizedDescription }
    }

    func beginSignIn() async {
        guard !isSigningIn else { return }
        isSigningIn = true
        defer { isSigningIn = false }
        errorMessage = nil
        authLogger.info("device sign-in started")
        do {
            let result = try await post("/api/auth/device/start", body: EmptyBody(), as: PKMSDeviceStart.self, authenticated: false)
            authLogger.info("device code received")
            deviceCode = result.user_code
            verificationURL = result.verification_uri
            deviceTask?.cancel()
            deviceTask = Task { await pollDeviceCode(result) }
        } catch {
            let urlError = error as? URLError
            let errorCode = urlError?.code.rawValue ?? 0
            let host = transport.endpoint(serverAddress: serverAddress, path: "/api/auth/device/start").host ?? "unknown"
            authLogger.error("device sign-in start failed: \(String(reflecting: type(of: error)), privacy: .public), urlCode=\(errorCode, privacy: .public), host=\(host, privacy: .public)")
            errorMessage = userFacingMessage(error)
        }
    }

    private func pollDeviceCode(_ flow: PKMSDeviceStart) async {
        let deadline = Date.now.addingTimeInterval(TimeInterval(flow.expires_in))
        var delay = max(flow.interval, 5)
        while !Task.isCancelled && Date.now < deadline {
            do {
                try await Task.sleep(for: .seconds(delay))
                var request = try makeRequest("/api/auth/device/poll", method: "POST", authenticated: false)
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONEncoder().encode(DevicePollBody(deviceCode: flow.device_code))
                let (data, response) = try await send(request)
                guard let http = response as? HTTPURLResponse else { throw PKMSClientError.malformedResponse }
                if http.statusCode == 202 {
                    authLogger.info("device authorization pending")
                    let pending = try JSONDecoder().decode(PKMSDevicePoll.self, from: data)
                    delay = max(pending.interval ?? flow.interval, 5)
                    continue
                }
                guard (200..<300).contains(http.statusCode) else { throw decodeServerError(data, status: http.statusCode, requestID: http.value(forHTTPHeaderField: "X-Request-ID")) }
                let result = try JSONDecoder().decode(PKMSDevicePoll.self, from: data)
                guard let issued = result.token, let signedInUser = result.user else { throw PKMSClientError.malformedResponse }
                authLogger.info("device sign-in completed")
                token = issued
                user = signedInUser
                SessionVault.write(issued, for: serverAddress)
                deviceCode = nil
                verificationURL = nil
                await loadWorkspaces()
                return
            } catch is CancellationError { return }
            catch let urlError as URLError where urlError.code == .cancelled && !Task.isCancelled {
                authLogger.warning("device poll request cancelled while sign-in remains active; retrying")
                delay = max(flow.interval, 5)
                continue
            }
            catch {
                let urlError = error as? URLError
                let errorCode = urlError?.code.rawValue ?? 0
                authLogger.error("device sign-in failed: \(String(reflecting: type(of: error)), privacy: .public), urlCode=\(errorCode, privacy: .public)")
                errorMessage = userFacingMessage(error)
                return
            }
        }
        deviceCode = nil
        verificationURL = nil
        errorMessage = "GitHub device code expired. Please sign in again."
    }

    func signOut() async {
        disconnectRealtime(); deviceTask?.cancel(); flushTask?.cancel()
        token = nil; user = nil; activeWorkspace = nil; activeFile = nil; document = nil
        activeFolderPath = nil
        workspaces = []; files = []; markdown = ""
        SessionVault.clear(for: serverAddress)
    }

    func scheduleCache(_ doc: NativeMarkdownDocument, workspaceID: String, fileID: String) {
        cacheTask?.cancel()
        cacheTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            self?.saveCache(doc, workspaceID: workspaceID, fileID: fileID)
        }
    }

    func saveCache(_ doc: NativeMarkdownDocument, workspaceID: String, fileID: String) {
        let url = cacheURL(workspaceID: workspaceID, fileID: fileID)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? doc.snapshot.write(to: url, options: .atomic)
        var recent = UserDefaults.standard.stringArray(forKey: "pkms.recent.files") ?? []
        let key = "\(workspaceID)/\(fileID)"
        recent.removeAll { $0 == key }
        recent.insert(key, at: 0)
        let evicted = recent.dropFirst(20)
        for item in evicted {
            let pieces = item.split(separator: "/", maxSplits: 1).map(String.init)
            if pieces.count == 2 { try? FileManager.default.removeItem(at: cacheURL(workspaceID: pieces[0], fileID: pieces[1])) }
        }
        UserDefaults.standard.set(Array(recent.prefix(20)), forKey: "pkms.recent.files")
    }

    func cacheURL(workspaceID: String, fileID: String) -> URL {
        URL.applicationSupportDirectory.appending(path: "PKMS/RecentCache/\(workspaceID)/\(fileID).crdt")
    }

    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try await get(endpoint(path), as: type)
    }

    func get<T: Decodable>(_ url: URL, as type: T.Type) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await send(request)
        try check(response, data: data)
        return try JSONDecoder.pkms.decode(type, from: data)
    }

    func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body, as type: Response.Type, authenticated: Bool = true) async throws -> Response {
        var request = try makeRequest(path, method: "POST", authenticated: authenticated)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await send(request)
        try check(response, data: data)
        return try JSONDecoder.pkms.decode(type, from: data)
    }

    func makeRequest(_ path: String, method: String, authenticated: Bool) throws -> URLRequest {
        transport.makeRequest(serverAddress: serverAddress, token: token, path: path, method: method, authenticated: authenticated)
    }

    func endpoint(_ path: String) -> URL {
        transport.endpoint(serverAddress: serverAddress, path: path)
    }

    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await transport.send(request)
    }

    func userFacingMessage(_ error: Error) -> String {
        transport.userFacingMessage(error)
    }

    func check(_ response: URLResponse, data: Data) throws {
        try transport.check(response, data: data)
    }

    func decodeServerError(_ data: Data, status: Int, requestID: String? = nil) -> Error {
        transport.decodeServerError(data, status: status, requestID: requestID)
    }
}

private struct EmptyBody: Encodable {}
struct ConnectBody: Encodable { let repository: String; let branch: String }
private struct DevicePollBody: Encodable {
    let deviceCode: String
}

extension JSONDecoder {
    static var pkms: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
