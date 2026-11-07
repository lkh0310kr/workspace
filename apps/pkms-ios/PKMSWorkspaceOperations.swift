import Foundation
import UniformTypeIdentifiers

extension PKMSModel {
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

    func loadDirectory(_ path: String) async {
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

    func scheduleFlush() {
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

    func preview(_ file: PKMSFile, workspace: PKMSWorkspace) async {
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

}
