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
    private(set) var workspaces: [PKMSWorkspace] = []
    private(set) var repositories: [PKMSRepository] = []
    private(set) var files: [PKMSFile] = []
    internal(set) var activeWorkspace: PKMSWorkspace?
    internal(set) var activeFile: PKMSFile?
    private(set) var activeFolderPath: String?
    internal(set) var markdown = ""
    private(set) var githubStatus = "synced"
    private(set) var pendingFiles = 0
    private(set) var statusMessage = ""
    internal(set) var errorMessage: String?
    private(set) var deviceCode: String?
    private(set) var verificationURL: URL?
    private(set) var isLoading = false
    private(set) var isRestoringSession = true
    private(set) var isSigningIn = false
    private(set) var previewURL: URL?
    internal(set) var collaborators: [PKMSPeer] = []

    var token: String?
    var document: NativeMarkdownDocument?
    var realtimeClient: SupabaseClient?
    var realtimeChannel: RealtimeChannelV2?
    var realtimeSubscriptions: [RealtimeSubscription] = []
    var realtimeTokenTask: Task<Void, Never>?
    var socketTask: Task<Void, Never>?
    private var deviceTask: Task<Void, Never>?
    private var cacheTask: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?
    var clientID = "ios-\(UUID().uuidString.lowercased())"
    private(set) var expandedFolders: Set<String> = [""]
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

    private func scheduleCache(_ doc: NativeMarkdownDocument, workspaceID: String, fileID: String) {
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

    private func cacheURL(workspaceID: String, fileID: String) -> URL {
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

    private func makeRequest(_ path: String, method: String, authenticated: Bool) throws -> URLRequest {
        transport.makeRequest(serverAddress: serverAddress, token: token, path: path, method: method, authenticated: authenticated)
    }

    func endpoint(_ path: String) -> URL {
        transport.endpoint(serverAddress: serverAddress, path: path)
    }

    private func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await transport.send(request)
    }

    private func userFacingMessage(_ error: Error) -> String {
        transport.userFacingMessage(error)
    }

    private func check(_ response: URLResponse, data: Data) throws {
        try transport.check(response, data: data)
    }

    private func decodeServerError(_ data: Data, status: Int, requestID: String? = nil) -> Error {
        transport.decodeServerError(data, status: status, requestID: requestID)
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
