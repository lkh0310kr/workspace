import Foundation
import Supabase

extension PKMSModel {
    func connectSocket(_ workspace: PKMSWorkspace) {
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
                realtimeSubscriptions.append(channel.onStatusChange { [weak self] status in
                    guard case .subscribed = status else { return }
                    let workspaceID = workspace.id
                    Task { @MainActor [weak self] in
                        guard let self, activeWorkspace?.id == workspaceID else { return }
                        resendPendingDocumentCaches(workspaceID: workspaceID)
                    }
                })
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

    func disconnectRealtime(cancelConnectionTask: Bool = true) {
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

    func trackPresence(fileID: String?) {
        guard let channel = realtimeChannel else { return }
        let presence = PKMSPresence(clientId: clientID, login: user?.login ?? "", avatarUrl: user?.avatarUrl, fileId: fileID)
        Task { try? await channel.track(presence) }
    }

    func handleSocketMessage(_ raw: String) async {
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

    func updateWorkspaceRevision(_ revision: Int) {
        guard var workspace = activeWorkspace else { return }
        workspace.revision = max(workspace.revision, revision)
        activeWorkspace = workspace
    }

    func sendFullState(_ doc: NativeMarkdownDocument, fileID: String) {
        let snapshot = doc.snapshot
        guard let workspace = activeWorkspace else { return }
        saveCache(doc, workspaceID: workspace.id, fileID: fileID)
        send(snapshot, fileID: fileID, fullState: snapshot)
    }

    func resendPendingDocumentCaches(workspaceID: String) {
        guard activeWorkspace?.id == workspaceID, realtimeChannel != nil else { return }
        let pendingKeys = Set(UserDefaults.standard.stringArray(forKey: "pkms.pending.files") ?? [])
        let pendingIDs = PKMSDocumentCachePolicy.pendingDocumentIDs(
            workspaceID: workspaceID,
            pendingKeys: pendingKeys
        )
        let activeFileID = activeFile?.id
        if let activeFileID, let document { sendFullState(document, fileID: activeFileID) }
        for fileID in pendingIDs where fileID != activeFileID {
            let cachedURL = cacheURL(workspaceID: workspaceID, fileID: fileID)
            guard let cachedSnapshot = try? Data(contentsOf: cachedURL) else { continue }
            let cachedDocument = NativeMarkdownDocument()
            guard cachedDocument.apply(cachedSnapshot) else { continue }
            sendFullState(cachedDocument, fileID: fileID)
        }
    }

    func send(
        _ update: Data,
        fileID: String?,
        fullState: Data? = nil,
        editGeneration: UInt64? = nil,
        isFinalUpdate: Bool = false
    ) {
        guard !update.isEmpty, let fileID, let workspace = activeWorkspace, realtimeChannel != nil else { return }
        let body = PKMSDocumentUpdate(operationId: UUID().uuidString, fileId: fileID, update: update.base64EncodedString())
        let key = "\(workspace.id)/\(fileID)"
        let fullStateGeneration = fullState == nil ? nil : (cacheEditGenerations[key] ?? 0)
        let previousSave = documentSaveTasks[key]
        let saveToken = UUID()
        documentSaveTaskTokens[key] = saveToken
        let saveTask = Task { [weak self] in
            guard let self else { return }
            await previousSave?.value
            do {
                let ack = try await post("/api/workspaces/\(workspace.id)/files/\(fileID)/updates", body: body, as: PKMSOperationResponse.self)
                updateWorkspaceRevision(ack.acceptedRevision)
                if fullState != nil {
                    cacheRequiresFullState.remove(key)
                    if fullStateGeneration == (cacheEditGenerations[key] ?? 0) {
                        markCacheSynchronized(workspaceID: workspace.id, fileID: fileID)
                    }
                } else if let generation = editGeneration,
                          PKMSDocumentCachePolicy.canClearPendingAfterIncrementalSave(
                            requestGeneration: generation,
                            currentGeneration: cacheEditGenerations[key] ?? 0,
                            isFinalUpdate: isFinalUpdate,
                            requiresFullState: cacheRequiresFullState.contains(key)
                          ) {
                    markCacheSynchronized(workspaceID: workspace.id, fileID: fileID)
                }
            } catch {
                cacheRequiresFullState.insert(key)
                errorMessage = "The change could not be saved. Retry shortly."
            }
            if documentSaveTaskTokens[key] == saveToken {
                documentSaveTasks.removeValue(forKey: key)
                documentSaveTaskTokens.removeValue(forKey: key)
            }
        }
        documentSaveTasks[key] = saveTask
    }

}
