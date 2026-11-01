import Foundation

// Codable models shared by the iOS UI model and its HTTP/Realtime adapters.
struct PKMSUser: Codable, Hashable {
    let login: String
    let avatarUrl: URL?
}

struct PKMSPeer: Decodable, Identifiable, Hashable {
    let clientId: String
    let login: String
    let avatarUrl: URL?
    let fileId: String?
    var id: String { clientId }
}

struct PKMSRealtimeConfig: Decodable { let url: URL; let anonKey: String }
struct PKMSRealtimeToken: Decodable { let token: String }

struct PKMSPresence: Codable, Sendable {
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
    var lastGitHubCommitAt: Date?
}

struct PKMSFile: Decodable, Identifiable, Hashable {
    let id: String
    let path: String
    let kind: String
    let revision: Int
    let content: String?
    let contentType: String?
    let size: Int?
    let sha256: String?
    var isMarkdown: Bool { kind == "markdown" }
}

struct PKMSSnapshot: Decodable {
    let workspaceId: String
    let revision: Int
    let files: [PKMSFile]
}

struct PKMSDirectory: Decodable { let path: String; let files: [PKMSFile] }

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
