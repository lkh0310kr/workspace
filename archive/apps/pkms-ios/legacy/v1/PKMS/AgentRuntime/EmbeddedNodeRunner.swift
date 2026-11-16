import Foundation
import NodeMobile
import UIKit

/// Runs Node inside the app process. iOS cannot launch Claude Code as an external
/// executable, so NodeMobile hosts the CLI and its in-process command shims here.
final class EmbeddedNodeRunner: @unchecked Sendable {
    static let shared = EmbeddedNodeRunner()

    var onOutput: (@Sendable (Data) -> Void)?
    var onRuntimeEnd: (@Sendable () -> Void)?
    var onAgentEvent: (@Sendable (Data) -> Void)?
    var onBrowserRequest: (@Sendable (URL) -> Void)?
    var onShellIdle: (@Sendable () -> Void)?
    var onCommandExit: (@Sendable (Int32, String) -> Void)?

    private let input = Pipe()
    private let output = Pipe()
    private let control = Pipe()
    private let lock = NSLock()
    private var started = false
    @MainActor private(set) var shellIsIdle = false
    private var eventBuffer = Data()
    private var jsonLineBuffer = Data()
    private var commandOutputBuffer = Data()
    private let outputParseLock = NSLock()
    private let writes = DispatchQueue(label: "pkms.embedded-node.stdin")

    private init() {}

    @MainActor
    func start(runtimeRoot: URL, workspace: URL, home: URL, settings: URL) {
        lock.lock()
        guard !started else { lock.unlock(); return }
        started = true
        lock.unlock()
        NSLog("[PKMS Claude] Embedded runtime starting")

        do {
            try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
            guard FileManager.default.fileExists(atPath: runtimeRoot.appending(path: "bootstrap.js").path),
                  FileManager.default.fileExists(atPath: runtimeRoot.appending(path: "vendor/claude-code/cli.js").path) else {
                throw RuntimeError.missingFiles
            }
            configureEnvironment(runtimeRoot: runtimeRoot, workspace: workspace, home: home, settings: settings)
            FileManager.default.changeCurrentDirectoryPath(workspace.path)
            signal(SIGPIPE, SIG_IGN)
            setvbuf(stdout, nil, _IONBF, 0)
            setvbuf(stderr, nil, _IONBF, 0)
            dup2(output.fileHandleForWriting.fileDescriptor, STDOUT_FILENO)
            dup2(output.fileHandleForWriting.fileDescriptor, STDERR_FILENO)
            dup2(input.fileHandleForReading.fileDescriptor, STDIN_FILENO)
            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                self?.consumeOutput(data)
            }
            launch(runtimeRoot: runtimeRoot)
        } catch {
            onOutput?(Data("\r\nPKMS could not start Claude Code: \(error.localizedDescription)\r\n".utf8))
        }
    }

    func send(_ data: Data) {
        writes.async { [input] in
            try? input.fileHandleForWriting.write(contentsOf: data)
        }
    }

    @MainActor
    func enqueue(_ command: String) {
        shellIsIdle = false
        outputParseLock.lock()
        commandOutputBuffer.removeAll(keepingCapacity: true)
        outputParseLock.unlock()
        let encoded = Data(command.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        sendControl("enqueue \(encoded)\n")
    }

    @MainActor
    func interrupt() {
        shellIsIdle = false
        sendControl("signal SIGINT\n")
    }

    @MainActor
    func waitUntilShellIdle(timeout: Duration = .seconds(15)) async -> Bool {
        if shellIsIdle { return true }
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)
        while clock.now < deadline {
            try? await Task.sleep(for: .milliseconds(100))
            if shellIsIdle { return true }
        }
        return shellIsIdle
    }

    private func consumeOutput(_ data: Data) {
        onOutput?(data)
        outputParseLock.lock()
        eventBuffer.append(data)
        jsonLineBuffer.append(data)
        if commandOutputBuffer.count < 256_000 {
            commandOutputBuffer.append(data.prefix(256_000 - commandOutputBuffer.count))
        }
        let pendingEvents = parseEvents()
        let pendingJSON = parseJSONLines()
        outputParseLock.unlock()

        for event in pendingEvents {
            switch event {
            case .open(let url):
                NSLog("[PKMS Claude] Authentication requested a browser")
                DispatchQueue.main.async { [weak self] in self?.onBrowserRequest?(url) }
            case .idle:
                NSLog("[PKMS Claude] Workspace runtime is ready")
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.shellIsIdle = true
                    self.onShellIdle?()
                }
            case .commandExit(let code, let output):
                NSLog("[PKMS Claude] CLI command finished with status %d", code)
                DispatchQueue.main.async { [weak self] in self?.onCommandExit?(code, output) }
            }
        }
        for object in pendingJSON {
            DispatchQueue.main.async { [weak self] in self?.onAgentEvent?(object) }
        }
    }

    private enum RuntimeEvent {
        case open(URL)
        case idle
        case commandExit(Int32, output: String)
    }

    private func parseEvents() -> [RuntimeEvent] {
        let prefix = Data([0x1b] + Array("]777;".utf8))
        var events: [RuntimeEvent] = []
        while let start = eventBuffer.range(of: prefix) {
            guard let end = eventBuffer[start.upperBound...].firstIndex(of: 0x07) else { break }
            let value = String(decoding: eventBuffer[start.upperBound..<end], as: UTF8.self)
            if value == "pkms-shell-idle" {
                events.append(.idle)
            } else if value.hasPrefix("pkms-command-exit;"),
                      let code = Int32(value.dropFirst("pkms-command-exit;".count)) {
                let output = String(decoding: commandOutputBuffer.suffix(12_000), as: UTF8.self)
                events.append(.commandExit(code, output: output))
                commandOutputBuffer.removeAll(keepingCapacity: true)
            } else if value.hasPrefix("pkms-open-url;") {
                let encoded = String(value.dropFirst("pkms-open-url;".count))
                    .replacingOccurrences(of: "-", with: "+")
                    .replacingOccurrences(of: "_", with: "/")
                let padded = encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4)
                if let bytes = Data(base64Encoded: padded),
                   let string = String(data: bytes, encoding: .utf8),
                   let url = URL(string: string), url.scheme == "https" {
                    events.append(.open(url))
                }
            }
            eventBuffer.removeSubrange(..<eventBuffer.index(after: end))
        }
        if eventBuffer.count > 4096 { eventBuffer = Data(eventBuffer.suffix(prefix.count)) }
        return events
    }

    private func parseJSONLines() -> [Data] {
        var result: [Data] = []
        while let newline = jsonLineBuffer.firstIndex(of: 0x0a) {
            let line = Data(jsonLineBuffer[..<newline])
            jsonLineBuffer.removeSubrange(...newline)
            guard let text = String(data: line, encoding: .utf8),
                  let brace = text.firstIndex(of: "{") else { continue }
            let json = String(text[brace...]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard let bytes = json.data(using: .utf8),
                  (try? JSONSerialization.jsonObject(with: bytes)) is [String: Any] else { continue }
            result.append(bytes)
        }
        if jsonLineBuffer.count > 1_000_000 { jsonLineBuffer.removeAll(keepingCapacity: true) }
        return result
    }

    func resize(columns: Int, rows: Int) {
        sendControl("resize \(columns) \(rows)\n")
    }

    private func sendControl(_ line: String) {
        writes.async { [control] in
            try? control.fileHandleForWriting.write(contentsOf: Data(line.utf8))
        }
    }

    private func configureEnvironment(runtimeRoot: URL, workspace: URL, home: URL, settings: URL) {
        let temp = FileManager.default.temporaryDirectory.path
        let env: [String: String] = [
            "HOME": home.path,
            "CLAUDE_CONFIG_DIR": home.appending(path: ".claude").path,
            "CLAUDE_IOS_SETTINGS_PATH": settings.path,
            "TMPDIR": temp,
            "PWD": workspace.path,
            "TERM": "xterm-256color",
            "FORCE_COLOR": "3",
            "COLUMNS": "80",
            "LINES": "24",
            "TZ": TimeZone.current.identifier,
            "LANG": "en_US.UTF-8",
            "CLAUDE_IOS_TTY": "1",
            "CLAUDE_IOS_SESSION": "1",
            "CLAUDE_IOS_CONTROL": "1",
            "CLAUDE_IOS_CONTROL_FD": String(control.fileHandleForReading.fileDescriptor),
            "CLAUDE_IOS_COLUMNS": "80",
            "CLAUDE_IOS_ROWS": "24",
            "DISABLE_AUTOUPDATER": "1",
            "DISABLE_TELEMETRY": "1",
            "DISABLE_ERROR_REPORTING": "1",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            "USE_BUILTIN_RIPGREP": "0",
            "SHELL": "/bin/bash",
            "PATH": "/bin:/usr/bin:/usr/local/bin",
            "NODE_PATH": runtimeRoot.appending(path: "node_modules").path,
        ]
        for (key, value) in env { setenv(key, value, 1) }
    }

    @MainActor
    private func launch(runtimeRoot: URL) {
        let bootstrap = runtimeRoot.appending(path: "bootstrap.js").path
        let argv = ["node", "--jitless", "--no-short-builtin-calls", "--regexp-interpret-all", "--stack-size=864", bootstrap]
        let thread = Thread { [weak self] in
            var cargs: [UnsafeMutablePointer<CChar>?] = argv.map { strdup($0) }
            cargs.append(nil)
            let status = cargs.withUnsafeMutableBufferPointer { buffer in
                node_start(Int32(argv.count), buffer.baseAddress)
            }
            for pointer in cargs where pointer != nil { free(pointer) }
            DispatchQueue.main.async {
                self?.onOutput?(Data("\r\nNode runtime ended (\(status)). Restart PKMS to start another Claude session.\r\n".utf8))
                self?.onRuntimeEnd?()
            }
        }
        thread.name = "pkms-embedded-node"
        thread.qualityOfService = .userInteractive
        thread.stackSize = 16 * 1024 * 1024
        thread.start()
    }

    enum RuntimeError: LocalizedError {
        case missingFiles
        var errorDescription: String? {
            "The bundled on-device Claude Code runtime is incomplete. Run the runtime preparation script and rebuild PKMS."
        }
    }
}
