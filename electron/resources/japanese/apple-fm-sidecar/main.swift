import Foundation
import FoundationModels

struct SidecarRequest: Codable {
  let task: String
  let text: String
  let level: String?
  let koreanDraft: String?
  let system: String?
  let user: String?
}

struct SidecarResponse: Codable {
  let ok: Bool
  let content: String?
  let error: String?
}

@available(macOS 26.0, *)
func runWithFoundationModels(_ request: SidecarRequest) async throws -> String {
  let model = SystemLanguageModel.default
  switch model.availability {
  case .available:
    break
  case .unavailable(let reason):
    throw NSError(
      domain: "AppleFMSidecar",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Apple Intelligence unavailable: \(reason)"]
    )
  @unknown default:
    throw NSError(
      domain: "AppleFMSidecar",
      code: 2,
      userInfo: [NSLocalizedDescriptionKey: "Apple Intelligence unavailable"]
    )
  }

  let instructions =
    request.system
    ?? "You are a Japanese study assistant. Reply concisely in Korean unless asked to output Japanese."
  let prompt = request.user ?? request.text
  let session = LanguageModelSession(instructions: instructions)
  let response = try await session.respond(to: prompt)
  return response.content
}

func writeResponse(_ response: SidecarResponse) {
  let encoder = JSONEncoder()
  guard let data = try? encoder.encode(response), let line = String(data: data, encoding: .utf8) else {
    fputs("{\"ok\":false,\"error\":\"encode_failed\"}\n", stdout)
    return
  }
  fputs(line + "\n", stdout)
  fflush(stdout)
}

if #available(macOS 26.0, *) {
  let input = FileHandle.standardInput.readDataToEndOfFile()
  guard !input.isEmpty, let request = try? JSONDecoder().decode(SidecarRequest.self, from: input) else {
    writeResponse(SidecarResponse(ok: false, content: nil, error: "invalid_request"))
    exit(1)
  }

  let semaphore = DispatchSemaphore(value: 0)
  var result: Result<String, Error>?
  Task {
    defer { semaphore.signal() }
    do {
      result = .success(try await runWithFoundationModels(request))
    } catch {
      result = .failure(error)
    }
  }
  semaphore.wait()

  switch result {
  case .success(let content):
    writeResponse(SidecarResponse(ok: true, content: content, error: nil))
    exit(0)
  case .failure(let error):
    writeResponse(SidecarResponse(ok: false, content: nil, error: error.localizedDescription))
    exit(1)
  case .none:
    writeResponse(SidecarResponse(ok: false, content: nil, error: "no_result"))
    exit(1)
  }
} else {
  writeResponse(SidecarResponse(ok: false, content: nil, error: "foundation_models_unavailable"))
  exit(1)
}
