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

    func sendFullState(_ doc: NativeMarkdownDocument, fileID: String) { send(doc.snapshot, fileID: fileID) }

    func send(_ update: Data, fileID: String?) {
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

}
