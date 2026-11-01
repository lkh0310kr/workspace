import Foundation
import Observation
import OSLog
import Supabase
import UniformTypeIdentifiers

struct PKMSUser: Codable, Hashable {
    let login: String
    let avatarUrl: URL?
}

struct PKMSPeer: Decodable, Identifiable, Hashable {
    let clientId: String
    let login: String
    let avatarUrl: URL?
    var id: String { clientId }
}
private struct PKMSRealtimeConfig: Decodable { let url: URL; let anonKey: String }
private struct PKMSRealtimeToken: Decodable { let token: String }
private struct PKMSPresence: Codable, Sendable {
    let clientId: String
    let login: String
    let avatarUrl: URL?
    let fileId: String?
}

struct PKMSRepository: Decodable, Identifiable, Hashable {
    let fullName: String
    let defaultBranch: String
    let `private`: Bool
    let canWrite: Bool
    var id: String { fullName }
}

struct PKMSWorkspace: Codable, Identifiable, Hashable {
    let id: String
    let repository: String
    let branch: String
    var revision: Int
    var githubStatus: String
    var message: String?
}

struct PKMSFile: Decodable, Identifiable, Hashable {
    let id: String
    let path: String
    let kind: String
    let content: String?
    let size: Int?
    var isMarkdown: Bool { kind == "markdown" }
}

struct PKMSSnapshot: Decodable {
    let workspaceId: String
    let revision: Int
    let files: [PKMSFile]
}
private struct PKMSDirectory: Decodable { let path: String; let files: [PKMSFile] }

struct PKMSSyncStatus: Decodable {
    let serverRevision: Int
    let githubStatus: String
    let githubHead: String?
    let lastGitHubCommitAt: Date?
    let nextGitHubFlushAt: Double?
    let pendingFiles: Int
    let message: String?
}

struct PKMSSessionResponse: Decodable { let user: PKMSUser? }
struct PKMSWorkspaceList: Decodable { let workspaces: [PKMSWorkspace] }
struct PKMSRepositoryList: Decodable { let repositories: [PKMSRepository] }
struct PKMSConnectedWorkspace: Decodable { let workspace: PKMSWorkspace }
struct PKMSDeviceStart: Decodable {
    let device_code: String
    let user_code: String
    let verification_uri: URL
    let expires_in: Int
    let interval: Int

    enum CodingKeys: String, CodingKey {
        case device_code, user_code, verification_uri, expires_in, interval
    }
}
struct PKMSDevicePoll: Decodable {
    let pending: Bool
    let interval: Int?
    let token: String?
    let user: PKMSUser?
}
struct PKMSFileUpdate: Decodable { let update: String }
struct PKMSOperationResponse: Decodable { let acceptedRevision: Int; let conflictCopyPath: String? }

struct PKMSOperationRequest: Encodable {
    let operationId: String
    let baseRevision: Int
    let clientId: String
    let operation: Operation

    struct Operation: Encodable {
        let type: String
        var path: String?
        var fileId: String?
        var content: String?
        var toPath: String?
    }
}

struct PKMSDocumentUpdate: Encodable {
    let type = "document-update"
    let operationId: String
    let fileId: String
    let update: String
}

struct PKMSHello: Encodable {
    let type = "hello"
    let protocolVersion = 1
    let clientId: String
    let afterRevision: Int
    let user: PKMSUser?
    let fileId: String?
}

enum PKMSClientError: LocalizedError {
    case invalidServerURL
    case unauthorized(String?)
    case http(Int, String)
    case malformedResponse

    var errorDescription: String? {
        switch self {
        case .invalidServerURL: "Enter a valid PKMS server URL."
        case .unauthorized(let requestID): "Sign in with GitHub to continue.\(requestID.map { " · \($0)" } ?? "")"
        case .http(let code, let message): "Server error \(code): \(message)"
        case .malformedResponse: "The PKMS server returned an invalid response."
        }
    }
}

@MainActor
@Observable
final class PKMSModel {
    private let authLogger = Logger(subsystem: "com.pkms.client", category: "auth")
    var serverAddress: String {
        didSet { UserDefaults.standard.set(serverAddress, forKey: "pkms.serverAddress") }
    }
    private(set) var user: PKMSUser?
    private(set) var workspaces: [PKMSWorkspace] = []
    private(set) var repositories: [PKMSRepository] = []
    private(set) var files: [PKMSFile] = []
    private(set) var activeWorkspace: PKMSWorkspace?
    private(set) var activeFile: PKMSFile?
    private(set) var activeFolderPath: String?
    private(set) var markdown = ""
    private(set) var githubStatus = "synced"
    private(set) var pendingFiles = 0
    private(set) var statusMessage = ""
    private(set) var errorMessage: String?
    private(set) var deviceCode: String?
    private(set) var verificationURL: URL?
    private(set) var isLoading = false
    private(set) var isRestoringSession = true
    private(set) var isSigningIn = false
    private(set) var previewURL: URL?
    private(set) var collaborators: [PKMSPeer] = []

    private var token: String?
    private var document: NativeMarkdownDocument?
    private var realtimeClient: SupabaseClient?
    private var realtimeChannel: RealtimeChannelV2?
    private var realtimeSubscriptions: [RealtimeSubscription] = []
    private var realtimeTokenTask: Task<Void, Never>?
    private var socketTask: Task<Void, Never>?
    private var deviceTask: Task<Void, Never>?
    private var cacheTask: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?
    private var clientID = "ios-\(UUID().uuidString.lowercased())"
    private(set) var expandedFolders: Set<String> = [""]
    @ObservationIgnored private var cachedURLSession: URLSession?

    private var urlSession: URLSession {
        if let cachedURLSession { return cachedURLSession }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration)
        cachedURLSession = session
        return session
    }

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
            let host = endpoint("/api/auth/device/start").host ?? "unknown"
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

    func loadWorkspaces() async {
        do {
            let result = try await get("/api/workspaces", as: PKMSWorkspaceList.self)
            workspaces = result.workspaces
            if let existing = activeWorkspace, let match = workspaces.first(where: { $0.id == existing.id }) {
                activeWorkspace = match
            } else if let first = workspaces.first {
                await selectWorkspace(first)
            } else {
                activeWorkspace = nil
                files = []
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func loadRepositories() async {
        do {
            repositories = try await get("/api/repositories", as: PKMSRepositoryList.self).repositories.filter(\.canWrite)
        } catch { errorMessage = error.localizedDescription }
    }

    func connect(_ repository: PKMSRepository) async {
        do {
            let result = try await post("/api/workspaces", body: ConnectBody(repository: repository.fullName, branch: repository.defaultBranch), as: PKMSConnectedWorkspace.self)
            await loadWorkspaces()
            await selectWorkspace(result.workspace)
        } catch { errorMessage = error.localizedDescription }
    }

    func selectWorkspace(_ workspace: PKMSWorkspace) async {
        isLoading = true
        defer { isLoading = false }
        disconnectRealtime()
        activeWorkspace = workspace
        activeFile = nil; activeFolderPath = nil; document = nil; markdown = ""; files = []
        expandedFolders = [""]
        collaborators = []
        do {
            let snapshot = try await get("/api/workspaces/\(workspace.id)/snapshot", as: PKMSSnapshot.self)
            files = snapshot.files
            await loadDirectory("")
            await refreshSyncStatus()
            connectSocket(workspace)
        } catch { errorMessage = error.localizedDescription }
    }

    func open(_ file: PKMSFile) async {
        dismissPreview()
        activeFolderPath = nil
        activeFile = file
        trackPresence(fileID: file.id)
        guard let workspace = activeWorkspace else { document = nil; markdown = ""; return }
        guard file.isMarkdown else {
            document = nil; markdown = ""
            await preview(file, workspace: workspace)
            return
        }
        let doc = NativeMarkdownDocument()
        document = doc
        let local = cacheURL(workspaceID: workspace.id, fileID: file.id)
        if let data = try? Data(contentsOf: local) { _ = doc.apply(data) }
        markdown = doc.text
        do {
            let vector = doc.stateVector.base64EncodedString()
            var components = URLComponents(url: endpoint("/api/workspaces/\(workspace.id)/files/\(file.id)/updates").absoluteURL, resolvingAgainstBaseURL: true)
            components?.queryItems = [URLQueryItem(name: "stateVector", value: vector)]
            guard let url = components?.url else { throw PKMSClientError.invalidServerURL }
            let update = try await get(url, as: PKMSFileUpdate.self)
            if let bytes = Data(base64Encoded: update.update) { _ = doc.apply(bytes) }
            markdown = doc.text
            saveCache(doc, workspaceID: workspace.id, fileID: file.id)
            if realtimeChannel != nil { sendFullState(doc, fileID: file.id) }
        } catch { errorMessage = error.localizedDescription }
    }

    func openFolder(_ file: PKMSFile) async {
        guard file.kind == "folder" else { return }
        dismissPreview()
        activeFile = nil
        activeFolderPath = file.path
        document = nil
        markdown = ""
        await loadDirectory(file.path)
    }

    func toggleFolder(_ file: PKMSFile) async {
        guard file.kind == "folder" else { return }
        if expandedFolders.contains(file.path) {
            expandedFolders.remove(file.path)
        } else {
            expandedFolders.insert(file.path)
            await loadDirectory(file.path)
        }
    }

    private func loadDirectory(_ path: String) async {
        guard let workspace = activeWorkspace,
              var components = URLComponents(url: endpoint("/api/workspaces/\(workspace.id)/directory").absoluteURL, resolvingAgainstBaseURL: true) else { return }
        components.queryItems = [URLQueryItem(name: "path", value: path)]
        guard let url = components.url else { return }
        do {
            let result = try await get(url, as: PKMSDirectory.self)
            guard activeWorkspace?.id == workspace.id else { return }
            var byID = Dictionary(uniqueKeysWithValues: files.map { ($0.id, $0) })
            for file in result.files { byID[file.id] = file }
            files = Array(byID.values)
        } catch { errorMessage = error.localizedDescription }
    }

    func editMarkdown(_ value: String) {
        guard let doc = document else { markdown = value; return }
        let previous = doc.text as NSString
        let next = value as NSString
        guard previous != next else { return }
        var prefix = 0
        while prefix < min(previous.length, next.length), previous.character(at: prefix) == next.character(at: prefix) { prefix += 1 }
        var suffix = 0
        while suffix < previous.length - prefix, suffix < next.length - prefix,
              previous.character(at: previous.length - suffix - 1) == next.character(at: next.length - suffix - 1) { suffix += 1 }
        let removed = previous.length - prefix - suffix
        let insertedRange = NSRange(location: prefix, length: next.length - prefix - suffix)
        let inserted = next.substring(with: insertedRange)
        if removed > 0 {
            let update = doc.delete(utf16Index: UInt32(prefix), length: UInt32(removed))
            send(update, fileID: activeFile?.id)
        }
        if !inserted.isEmpty {
            let update = doc.insert(utf16Index: UInt32(prefix), text: inserted)
            send(update, fileID: activeFile?.id)
        }
        markdown = doc.text
        if let workspace = activeWorkspace, let file = activeFile { scheduleCache(doc, workspaceID: workspace.id, fileID: file.id) }
        scheduleFlush()
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await self?.flushNow()
        }
    }

    func flushNow() async {
        flushTask?.cancel()
        guard let workspace = activeWorkspace else { return }
        do {
            let status = try await get("/api/workspaces/\(workspace.id)/sync-status", as: PKMSSyncStatus.self)
            githubStatus = status.githubStatus
            pendingFiles = status.pendingFiles
            statusMessage = status.message ?? ""
        } catch { errorMessage = error.localizedDescription }
    }

    func createNote() async {
        guard let workspace = activeWorkspace else { return }
        let folder = activeFolderPath.map { "\($0)/" } ?? ""
        let filename = "\(folder)Untitled-\(Int(Date.now.timeIntervalSince1970)).md"
        let body = PKMSOperationRequest(operationId: UUID().uuidString, baseRevision: workspace.revision, clientId: clientID,
            operation: .init(type: "create-file", path: filename, fileId: UUID().uuidString, content: "# Untitled\n\n"))
        do {
            let result = try await post("/api/workspaces/\(workspace.id)/operations", body: body, as: PKMSOperationResponse.self)
            await reloadFiles()
            if let file = files.first(where: { $0.path == (result.conflictCopyPath ?? filename) }) { await open(file) }
        } catch { errorMessage = error.localizedDescription }
    }

    func createFolder() async {
        guard let workspace = activeWorkspace else { return }
        let folder = activeFolderPath.map { "\($0)/" } ?? ""
        let body = PKMSOperationRequest(operationId: UUID().uuidString, baseRevision: workspace.revision, clientId: clientID,
            operation: .init(type: "create-folder", path: "\(folder)New Folder"))
        do { _ = try await post("/api/workspaces/\(workspace.id)/operations", body: body, as: PKMSOperationResponse.self); await reloadFiles() }
        catch { errorMessage = error.localizedDescription }
    }

    func upload(_ fileURL: URL) async {
        guard let workspace = activeWorkspace else { return }
        let scoped = fileURL.startAccessingSecurityScopedResource()
        defer { if scoped { fileURL.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: fileURL)
            let boundary = "PKMS-\(UUID().uuidString)"
            var body = Data()
            func append(_ value: String) { body.append(Data(value.utf8)) }
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"path\"\r\n\r\n\(fileURL.lastPathComponent)\r\n")
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"clientId\"\r\n\r\n\(clientID)\r\n")
            let safeFilename = fileURL.lastPathComponent.replacingOccurrences(of: "\"", with: "")
            let contentType = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeFilename)\"\r\nContent-Type: \(contentType)\r\n\r\n")
            body.append(data)
            append("\r\n--\(boundary)--\r\n")
            var request = try makeRequest("/api/workspaces/\(workspace.id)/upload", method: "POST", authenticated: true)
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
            let (responseData, response) = try await send(request)
            try check(response, data: responseData)
            await reloadFiles()
        } catch { errorMessage = error.localizedDescription }
    }

    private func preview(_ file: PKMSFile, workspace: PKMSWorkspace) async {
        do {
            var request = try makeRequest("/api/workspaces/\(workspace.id)/assets/\(file.id)", method: "GET", authenticated: true)
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (data, response) = try await send(request)
            try check(response, data: data)
            let name = String(file.path.split(separator: "/").last ?? "file")
            let url = FileManager.default.temporaryDirectory.appending(path: "PKMS-\(UUID().uuidString)-\(name)")
            try data.write(to: url, options: .atomic)
            previewURL = url
        } catch { errorMessage = error.localizedDescription }
    }

    func dismissPreview() {
        if let previewURL { try? FileManager.default.removeItem(at: previewURL) }
        previewURL = nil
    }

    func refreshSyncStatus() async {
        guard let workspace = activeWorkspace else { return }
        do {
            let status = try await get("/api/workspaces/\(workspace.id)/sync-status", as: PKMSSyncStatus.self)
            githubStatus = status.githubStatus
            pendingFiles = status.pendingFiles
            statusMessage = status.message ?? ""
        } catch { }
    }

    func dismissError() { errorMessage = nil }

    func reloadFiles() async {
        guard let workspace = activeWorkspace else { return }
        do {
            files = try await get("/api/workspaces/\(workspace.id)/snapshot", as: PKMSSnapshot.self).files
            let folders = expandedFolders.sorted { $0.count < $1.count }
            for folder in folders { await loadDirectory(folder) }
        }
        catch { errorMessage = error.localizedDescription }
    }

    private func connectSocket(_ workspace: PKMSWorkspace) {
        disconnectRealtime()
        socketTask = Task { [weak self] in
            guard let self else { return }
            do {
                let config = try await get("/api/realtime/config", as: PKMSRealtimeConfig.self)
                let auth = try await get("/api/realtime/token", as: PKMSRealtimeToken.self)
                let client = SupabaseClient(supabaseURL: config.url, supabaseKey: config.anonKey)
                realtimeClient = client
                await client.realtimeV2.setAuth(auth.token)
                let presenceKey = clientID
                let channel = client.channel("pkms:\(workspace.id)") { config in
                    config.isPrivate = true
                    config.presence = PresenceJoinConfig(key: presenceKey)
                }
                realtimeChannel = channel
                realtimeSubscriptions.append(channel.onBroadcast(event: "protocol") { [weak self] payload in
                    guard let data = try? JSONEncoder().encode(payload), let raw = String(data: data, encoding: .utf8) else { return }
                    Task { @MainActor in await self?.handleSocketMessage(raw) }
                })
                realtimeSubscriptions.append(channel.onPresenceChange { [weak self] action in
                    let joins = (try? action.decodeJoins(as: PKMSPeer.self)) ?? []
                    let leaves = (try? action.decodeLeaves(as: PKMSPeer.self)) ?? []
                    Task { @MainActor in
                        guard let self else { return }
                        for peer in leaves { self.collaborators.removeAll { $0.clientId == peer.clientId } }
                        for peer in joins where peer.clientId != self.clientID {
                            self.collaborators.removeAll { $0.clientId == peer.clientId }
                            self.collaborators.append(peer)
                        }
                    }
                })
                try await channel.subscribeWithError()
                try await channel.track(PKMSPresence(clientId: clientID, login: user?.login ?? "", avatarUrl: user?.avatarUrl, fileId: activeFile?.id))
                if let file = activeFile, let document { sendFullState(document, fileID: file.id) }
                realtimeTokenTask = Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(10 * 60))
                        guard !Task.isCancelled, let self else { return }
                        do {
                            let refreshed = try await get("/api/realtime/token", as: PKMSRealtimeToken.self)
                            await realtimeClient?.realtimeV2.setAuth(refreshed.token)
                        } catch {
                            errorMessage = "Live sync authorization expired. Reconnect to continue collaborating."
                            disconnectRealtime()
                            return
                        }
                    }
                }
            } catch {
                if !Task.isCancelled { errorMessage = "Live sync is unavailable. Your changes remain saved." }
                disconnectRealtime(cancelConnectionTask: false)
            }
        }
    }

    private func disconnectRealtime(cancelConnectionTask: Bool = true) {
        if cancelConnectionTask { socketTask?.cancel() }
        socketTask = nil
        realtimeTokenTask?.cancel(); realtimeTokenTask = nil
        realtimeSubscriptions.removeAll()
        if let channel = realtimeChannel, let client = realtimeClient {
            Task { await client.removeChannel(channel) }
        }
        realtimeChannel = nil; realtimeClient = nil
        collaborators = []
    }

    private func trackPresence(fileID: String?) {
        guard let channel = realtimeChannel else { return }
        let presence = PKMSPresence(clientId: clientID, login: user?.login ?? "", avatarUrl: user?.avatarUrl, fileId: fileID)
        Task { try? await channel.track(presence) }
    }

    private func handleSocketMessage(_ raw: String) async {
        guard let data = raw.data(using: .utf8), let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if message["type"] as? String == "document-update",
           let fileID = message["fileId"] as? String, let updateText = message["update"] as? String,
           let update = Data(base64Encoded: updateText) {
            if activeFile?.id == fileID, let document {
                _ = document.apply(update)
                markdown = document.text
                if let workspace = activeWorkspace { saveCache(document, workspaceID: workspace.id, fileID: fileID) }
            }
            if let revision = message["acceptedRevision"] as? Int { updateWorkspaceRevision(revision) }
            return
        }
        if let conflictPath = message["conflictCopyPath"] as? String, message["acceptedRevision"] != nil {
            await reloadFiles()
            if let conflict = files.first(where: { $0.path == conflictPath }) { await open(conflict) }
            return
        }
        if message["acceptedRevision"] != nil {
            if message["type"] as? String == "ack", let revision = message["acceptedRevision"] as? Int { updateWorkspaceRevision(revision) }
            else { await reloadFiles() }
        }
    }

    private func updateWorkspaceRevision(_ revision: Int) {
        guard var workspace = activeWorkspace else { return }
        workspace.revision = max(workspace.revision, revision)
        activeWorkspace = workspace
    }

    private func sendFullState(_ doc: NativeMarkdownDocument, fileID: String) { send(doc.snapshot, fileID: fileID) }

    private func send(_ update: Data, fileID: String?) {
        guard !update.isEmpty, let fileID, let workspace = activeWorkspace, realtimeChannel != nil else { return }
        let body = PKMSDocumentUpdate(operationId: UUID().uuidString, fileId: fileID, update: update.base64EncodedString())
        Task { [weak self] in
            guard let self else { return }
            do {
                let ack = try await post("/api/workspaces/\(workspace.id)/files/\(fileID)/updates", body: body, as: PKMSOperationResponse.self)
                updateWorkspaceRevision(ack.acceptedRevision)
            } catch { errorMessage = "The change could not be saved. Retry shortly." }
        }
    }

    private func scheduleCache(_ doc: NativeMarkdownDocument, workspaceID: String, fileID: String) {
        cacheTask?.cancel()
        cacheTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            self?.saveCache(doc, workspaceID: workspaceID, fileID: fileID)
        }
    }

    private func saveCache(_ doc: NativeMarkdownDocument, workspaceID: String, fileID: String) {
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

    private func cacheURL(workspaceID: String, fileID: String) -> URL {
        URL.applicationSupportDirectory.appending(path: "PKMS/RecentCache/\(workspaceID)/\(fileID).crdt")
    }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try await get(endpoint(path), as: type)
    }

    private func get<T: Decodable>(_ url: URL, as type: T.Type) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await send(request)
        try check(response, data: data)
        return try JSONDecoder.pkms.decode(type, from: data)
    }

    private func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body, as type: Response.Type, authenticated: Bool = true) async throws -> Response {
        var request = try makeRequest(path, method: "POST", authenticated: authenticated)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await send(request)
        try check(response, data: data)
        return try JSONDecoder.pkms.decode(type, from: data)
    }

    private func makeRequest(_ path: String, method: String, authenticated: Bool) throws -> URLRequest {
        var request = URLRequest(url: endpoint(path))
        request.httpMethod = method
        if authenticated, let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    private func endpoint(_ path: String) -> URL {
        let base = URL(string: serverAddress) ?? URL(string: "https://pkms-cloud.lkh0310kr.workers.dev")!
        return URL(string: path, relativeTo: base) ?? base
    }

    private func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        var attempt = 0
        let path = request.url?.path ?? ""
        let mayRetry = request.httpMethod == "GET" || path == "/api/auth/device/start" || path == "/api/auth/device/poll"
        while true {
            do { return try await urlSession.data(for: request) }
            catch {
                let retryable: Set<URLError.Code> = [.networkConnectionLost, .timedOut, .cannotConnectToHost, .dnsLookupFailed, .notConnectedToInternet]
                guard mayRetry, attempt < 2, let urlError = error as? URLError, retryable.contains(urlError.code) else { throw error }
                attempt += 1
                authLogger.warning("network request retry attempt=\(attempt, privacy: .public), urlCode=\(urlError.code.rawValue, privacy: .public)")
                try await Task.sleep(for: .seconds(attempt))
            }
        }
    }

    private func userFacingMessage(_ error: Error) -> String {
        guard let urlError = error as? URLError else { return error.localizedDescription }
        switch urlError.code {
        case .networkConnectionLost:
            return "The network connection was lost. Reconnecting… Please try again if it continues."
        case .notConnectedToInternet:
            return "Connect to Wi-Fi or cellular data, then try again."
        case .timedOut:
            return "The connection timed out. Please try again."
        default:
            return error.localizedDescription
        }
    }

    private func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw PKMSClientError.malformedResponse }
        guard (200..<300).contains(http.statusCode) else {
            let requestID = http.value(forHTTPHeaderField: "X-Request-ID")
            if http.statusCode == 401 { throw PKMSClientError.unauthorized(requestID) }
            throw decodeServerError(data, status: http.statusCode, requestID: requestID)
        }
    }

    private func decodeServerError(_ data: Data, status: Int, requestID: String? = nil) -> Error {
        let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let message = payload?["message"] as? String ?? payload?["error"] as? String ?? "Request failed"
        return PKMSClientError.http(status, requestID.map { "\(message) · \($0)" } ?? message)
    }
}

private struct EmptyBody: Encodable {}
private struct ConnectBody: Encodable { let repository: String; let branch: String }
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
