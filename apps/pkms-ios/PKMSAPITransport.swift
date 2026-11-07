import Foundation
import OSLog

struct PKMSAPITransport {
    private let logger = Logger(subsystem: "com.pkms.client", category: "network")
    private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()

    func endpoint(serverAddress: String, path: String) -> URL {
        let base = URL(string: serverAddress) ?? URL(string: "https://pkms-cloud.lkh0310kr.workers.dev")!
        return URL(string: path, relativeTo: base) ?? base
    }

    func makeRequest(serverAddress: String, token: String?, path: String, method: String, authenticated: Bool) -> URLRequest {
        var request = URLRequest(url: endpoint(serverAddress: serverAddress, path: path))
        request.httpMethod = method
        if authenticated, let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        var attempt = 0
        let path = request.url?.path ?? ""
        let mayRetry = request.httpMethod == "GET" || path == "/api/auth/device/start" || path == "/api/auth/device/poll"
        while true {
            do { return try await session.data(for: request) }
            catch {
                let retryable: Set<URLError.Code> = [.networkConnectionLost, .timedOut, .cannotConnectToHost, .dnsLookupFailed, .notConnectedToInternet]
                guard mayRetry, attempt < 2, let urlError = error as? URLError, retryable.contains(urlError.code) else { throw error }
                attempt += 1
                logger.warning("network request retry attempt=\(attempt, privacy: .public), urlCode=\(urlError.code.rawValue, privacy: .public)")
                try await Task.sleep(for: .seconds(attempt))
            }
        }
    }

    func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw PKMSClientError.malformedResponse }
        guard (200..<300).contains(http.statusCode) else {
            let requestID = http.value(forHTTPHeaderField: "X-Request-ID")
            if http.statusCode == 401 { throw PKMSClientError.unauthorized(requestID) }
            throw decodeServerError(data, status: http.statusCode, requestID: requestID)
        }
    }

    func decodeServerError(_ data: Data, status: Int, requestID: String? = nil) -> Error {
        let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let message = payload?["message"] as? String ?? payload?["error"] as? String ?? "Request failed"
        return PKMSClientError.http(status, requestID.map { "\(message) · \($0)" } ?? message)
    }

    func userFacingMessage(_ error: Error) -> String {
        guard let urlError = error as? URLError else { return error.localizedDescription }
        switch urlError.code {
        case .networkConnectionLost: return "The network connection was lost. Reconnecting… Please try again if it continues."
        case .notConnectedToInternet: return "Connect to Wi-Fi or cellular data, then try again."
        case .timedOut: return "The connection timed out. Please try again."
        default: return error.localizedDescription
        }
    }
}
