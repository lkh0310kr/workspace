import SwiftUI
import SafariServices
import Observation

struct OnDeviceClaudeView: View {
    @Environment(VaultStore.self) private var store
    @Environment(SyncController.self) private var sync
    @Environment(\.dismiss) private var dismiss
    @State private var session: ClaudeCodeChatSession?
    @State private var browserRoute: ClaudeBrowserRoute?
    @State private var setupError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let session {
                    ClaudeChatScreen(session: session)
                } else if let setupError {
                    ContentUnavailableView("Couldn’t prepare Claude Code", systemImage: "exclamationmark.triangle", description: Text(setupError))
                } else {
                    ProgressView("Preparing Claude Code…")
                }
            }
            .navigationTitle("Claude Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text("Claude Code").font(.headline)
                        Text("On this iPhone · PKMS vault").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .sheet(item: $browserRoute) { route in
            ClaudeAuthBrowser(url: route.url)
                .ignoresSafeArea()
        }
        .task {
            guard let vault = store.repository as? LocalVaultRepository else { return }
            do {
                let rules = try await AgentDataPolicy.readRules(from: store.repository)
                let home = URL.applicationSupportDirectory.appending(path: "claude-code-home", directoryHint: .isDirectory)
                let preparedSettings = try ClaudeVaultPolicy.writeSettings(vaultRoot: vault.rootURL, home: home, rules: rules)
                let chat = ClaudeCodeChatSession(settingsURL: preparedSettings, vaultRoot: vault.rootURL, repository: store.repository)
                session = chat
                let runner = EmbeddedNodeRunner.shared
                runner.onAgentEvent = { data in
                    Task { @MainActor in chat.receive(data: data) }
                }
                runner.onCommandExit = { code, output in
                    Task { @MainActor in
                        chat.commandFinished(exitCode: code, output: output)
                        if !chat.isSigningIn { browserRoute = nil }
                    }
                }
                runner.onBrowserRequest = { url in
                    Task { @MainActor in
                        chat.browserDidOpen()
                        browserRoute = ClaudeBrowserRoute(url: url)
                    }
                }
                runner.onShellIdle = {
                    Task { @MainActor in chat.runtimeBecameIdle() }
                }
                chat.isRuntimeReady = runner.shellIsIdle
            } catch {
                setupError = error.localizedDescription
            }
        }
        .onDisappear {
            Task { @MainActor in
                let runner = EmbeddedNodeRunner.shared
                if !runner.shellIsIdle {
                    runner.interrupt()
                    _ = await runner.waitUntilShellIdle(timeout: .seconds(15))
                }
                await store.reload()
                if runner.shellIsIdle, sync.repository != nil { await sync.sync() }
            }
        }
    }
}

/// Starts the embedded runtime with the PKMS app, before the agent screen opens.
struct ClaudeRuntimeHost: View {
    @Environment(VaultStore.self) private var store

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .task {
                guard let vault = store.repository as? LocalVaultRepository,
                      let runtime = Bundle.main.resourceURL?.appending(path: "RuntimeTemplate", directoryHint: .isDirectory) else { return }
                do {
                    let rules = try await AgentDataPolicy.readRules(from: store.repository)
                    let home = URL.applicationSupportDirectory.appending(path: "claude-code-home", directoryHint: .isDirectory)
                    let settings = try ClaudeVaultPolicy.writeSettings(vaultRoot: vault.rootURL, home: home, rules: rules)
                    EmbeddedNodeRunner.shared.start(runtimeRoot: runtime, workspace: vault.rootURL, home: home, settings: settings)
                } catch {
                    NSLog("PKMS Claude runtime preparation failed: %@", error.localizedDescription)
                }
            }
    }
}

private struct ClaudeBrowserRoute: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ClaudeAuthBrowser: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

private struct ClaudeChatEntry: Identifiable {
    enum Kind { case user, assistant, activity }
    let id = UUID()
    let kind: Kind
    let text: String
}

@MainActor
@Observable
private final class ClaudeCodeChatSession {
    private(set) var entries: [ClaudeChatEntry] = []
    var draft = ""
    var isSigningIn = false
    var loginStatus: String?
    var hasBrowserOpened = false
    var isSending = false
    var isRuntimeReady = false
    var error: String?
    var streamedText = ""
    private var pendingAction: PendingAction = .none
    private var usedSession = false
    private let settingsURL: URL
    private let vaultRoot: URL
    private let repository: any VaultRepository

    private enum PendingAction { case none, signIn, signOut, message }
    private(set) var isSignedIn = false

    init(settingsURL: URL, vaultRoot: URL, repository: any VaultRepository) {
        self.settingsURL = settingsURL
        self.vaultRoot = vaultRoot
        self.repository = repository
        entries.append(ClaudeChatEntry(kind: .assistant, text: "Ask Claude to find, explain, or edit Markdown in this PKMS vault. Claude Code runs on this iPhone; prompts and the notes it reads are sent to Anthropic."))
    }

    func signIn() {
        guard isRuntimeReady, !isSigningIn else { return }
        NSLog("[PKMS Claude] Sign-in requested")
        error = nil
        isSigningIn = true
        hasBrowserOpened = false
        loginStatus = "Starting Claude sign-in…"
        pendingAction = .signIn
        EmbeddedNodeRunner.shared.enqueue("claude auth login")
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(12))
            guard let self, self.isSigningIn, !self.hasBrowserOpened else { return }
            self.loginStatus = "Claude hasn’t opened the sign-in page yet. Check the error below or cancel and retry."
            self.error = "The on-device CLI did not request a browser page within 12 seconds."
        }
    }

    func browserDidOpen() {
        hasBrowserOpened = true
        loginStatus = "Sign in in the browser. PKMS will return to chat when Claude confirms."
        error = nil
    }

    func cancelSignIn() {
        guard isSigningIn else { return }
        EmbeddedNodeRunner.shared.interrupt()
    }

    func send() async {
        let prompt = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !isSending, isRuntimeReady else { return }
        do {
            let rules = try await AgentDataPolicy.readRules(from: repository)
            let home = settingsURL.deletingLastPathComponent().deletingLastPathComponent()
            _ = try ClaudeVaultPolicy.writeSettings(vaultRoot: vaultRoot, home: home, rules: rules)
        } catch {
            self.error = "Couldn’t refresh the vault privacy rules: \(error.localizedDescription)"
            return
        }
        draft = ""
        error = nil
        streamedText = ""
        entries.append(ClaudeChatEntry(kind: .user, text: prompt))
        isSending = true
        pendingAction = .message
        let mode = usedSession ? "--continue " : ""
        let command = "claude -p --output-format stream-json --verbose --include-partial-messages --permission-mode acceptEdits \(mode)\(Self.shellQuote(prompt))"
        EmbeddedNodeRunner.shared.enqueue(command)
    }

    func signOut() {
        guard isRuntimeReady, !isSending, !isSigningIn else { return }
        pendingAction = .signOut
        isSigningIn = true
        EmbeddedNodeRunner.shared.enqueue("claude auth logout")
    }

    func receive(data: Data) {
        guard let event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        let type = event["type"] as? String ?? ""
        switch type {
        case "system":
            if event["subtype"] as? String == "init" { usedSession = true }
        case "assistant":
            if let message = event["message"] as? [String: Any],
               let content = message["content"] as? [[String: Any]] {
                for item in content {
                    if item["type"] as? String == "text", let text = item["text"] as? String, streamedText.isEmpty {
                        streamedText = text
                    } else if item["type"] as? String == "tool_use" {
                        let name = item["name"] as? String ?? "Claude tool"
                        entries.append(ClaudeChatEntry(kind: .activity, text: activityName(name)))
                    }
                }
            }
        case "stream_event":
            guard let inner = event["event"] as? [String: Any],
                  inner["type"] as? String == "content_block_delta",
                  let delta = inner["delta"] as? [String: Any],
                  delta["type"] as? String == "text_delta",
                  let text = delta["text"] as? String else { return }
            streamedText += text
        case "result":
            if let text = event["result"] as? String, streamedText.isEmpty { streamedText = text }
            if let subtype = event["subtype"] as? String, subtype.contains("error") {
                error = (event["errors"] as? [String])?.joined(separator: "\n") ?? "Claude Code could not complete the request."
            }
        default:
            break
        }
    }

    func commandFinished(exitCode: Int32, output: String) {
        switch pendingAction {
        case .signIn:
            isSigningIn = false
            loginStatus = nil
            if exitCode == 0 {
                isSignedIn = true
                entries.append(ClaudeChatEntry(kind: .activity, text: "Claude account session updated."))
            } else {
                error = Self.errorDetails(output) ?? "Claude sign-in did not finish. Try again or check the browser sign-in page."
            }
        case .signOut:
            isSigningIn = false
            loginStatus = nil
            if exitCode == 0 {
                isSignedIn = false
                entries.append(ClaudeChatEntry(kind: .activity, text: "Signed out of Claude."))
            } else {
                error = Self.errorDetails(output) ?? "Couldn’t sign out of Claude."
            }
        case .message:
            isSending = false
            if !streamedText.isEmpty { entries.append(ClaudeChatEntry(kind: .assistant, text: streamedText)) }
            if exitCode != 0 {
                error = Self.errorDetails(output) ?? error ?? "Claude Code stopped with exit code \(exitCode)."
            }
        case .none:
            break
        }
        pendingAction = .none
        streamedText = ""
    }

    func runtimeBecameIdle() { isRuntimeReady = true }

    private func activityName(_ tool: String) -> String {
        switch tool {
        case "Read": "Reading a PKMS file"
        case "Edit", "Write": "Updating a PKMS file"
        case "Glob", "Grep": "Searching the vault"
        default: "Using \(tool)"
        }
    }

    private static func shellQuote(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private static func errorDetails(_ output: String) -> String? {
        var visibleScalars: [Unicode.Scalar] = []
        var escapeMode = 0 // 0=text, 1=ESC, 2=CSI, 3=OSC, 4=OSC after ESC
        for scalar in output.unicodeScalars {
            if escapeMode == 0 {
                if scalar == "\u{1B}" { escapeMode = 1; continue }
                if !CharacterSet.controlCharacters.contains(scalar) || scalar == "\n" || scalar == "\t" {
                    visibleScalars.append(scalar)
                }
                continue
            }
            switch escapeMode {
            case 1:
                escapeMode = scalar == "[" ? 2 : (scalar == "]" ? 3 : 0)
            case 2:
                if (0x40...0x7e).contains(scalar.value) { escapeMode = 0 }
            case 3:
                if scalar == "\u{07}" { escapeMode = 0 }
                else if scalar == "\u{1B}" { escapeMode = 4 }
            case 4:
                escapeMode = scalar == "\\" ? 0 : 3
            default:
                escapeMode = 0
            }
        }
        let lines = String(String.UnicodeScalarView(visibleScalars)).split(whereSeparator: \.isNewline).map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        let diagnostic = lines.last { line in
            let lower = line.lowercased()
            return ["error", "failed", "not logged", "unauthorized", "invalid", "denied"].contains { lower.contains($0) }
        } ?? lines.last(where: { !$0.isEmpty })
        guard let diagnostic, !diagnostic.isEmpty else { return nil }
        let safe = diagnostic.replacingOccurrences(of: "https?://\\S+", with: "[sign-in URL]", options: .regularExpression)
        return String(safe.prefix(700))
    }
}

private struct ClaudeChatScreen: View {
    @Bindable var session: ClaudeCodeChatSession

    var body: some View {
        VStack(spacing: 0) {
            if !session.isRuntimeReady {
                ProgressView("Starting on-device Claude Code…").padding()
            }
            if !session.isSigningIn && !session.isSending {
                HStack(spacing: 10) {
                    Label("Edits are saved directly to this vault", systemImage: "iphone")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    Menu {
                        if session.isSignedIn {
                            Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { session.signOut() }
                        } else {
                            Button("Sign in with Claude", systemImage: "person.crop.circle") { session.signIn() }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle").font(.title3)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
            }
            if !session.isSignedIn {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "person.crop.circle.badge.checkmark").font(.system(size: 42)).foregroundStyle(.tint)
                    Text("Sign in to Claude").font(.title3.weight(.semibold))
                    Text("Your Claude account processes prompts and any PKMS notes Claude reads. The on-device CLI writes allowed file edits directly into this vault.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 24)
                    Button { session.signIn() } label: {
                        HStack { if session.isSigningIn { ProgressView().tint(.white) }; Text(session.isSigningIn ? "Opening Claude sign-in…" : "Continue with Claude") }
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).disabled(!session.isRuntimeReady || session.isSigningIn)
                    if session.isSigningIn {
                        Text(session.loginStatus ?? "Starting the Claude CLI…")
                            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
                        Button("Cancel sign-in", role: .cancel) { session.cancelSignIn() }
                            .font(.footnote)
                    }
                    if let error = session.error {
                        Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center).padding(.horizontal)
                    }
                    Spacer()
                }
            } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if !session.isRuntimeReady { Color.clear.frame(height: 1) }
                        ForEach(session.entries) { entry in
                            entryView(entry).id(entry.id)
                        }
                        if session.isSending {
                            if !session.streamedText.isEmpty {
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "sparkles").foregroundStyle(.tint).padding(.top, 3)
                                    Text(session.streamedText).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                                }.padding(12).background(.quaternary.opacity(0.45), in: .rect(cornerRadius: 16))
                            } else {
                                HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Claude is working…").font(.caption).foregroundStyle(.secondary) }
                                    .id("claude-working")
                            }
                        }
                        if let error = session.error {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote).foregroundStyle(.red).padding(.horizontal, 12)
                        }
                    }.padding(16)
                }
                .onChange(of: session.entries.count) { _, _ in
                    if let last = session.entries.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
                .onChange(of: session.streamedText) { _, _ in
                    if session.isSending { withAnimation { proxy.scrollTo("claude-working", anchor: .bottom) } }
                }
            }
            if !session.isSending && !session.isSigningIn {
                VStack(spacing: 6) {
                    Text("Claude can read and edit files allowed by .aiignore. Changes are written directly; review the vault history if needed.")
                        .font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Ask Claude about your PKMS…", text: $session.draft, axis: .vertical)
                            .lineLimit(1...5).textFieldStyle(.roundedBorder)
                            .disabled(!session.isRuntimeReady)
                            .onSubmit { Task { await session.send() } }
                        Button { Task { await session.send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 30)) }
                            .buttonStyle(.plain)
                            .disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !session.isRuntimeReady)
                            .accessibilityLabel("Send")
                    }
                }.padding(.horizontal, 12).padding(.vertical, 10).background(.bar)
            } else if session.isSigningIn {
                HStack(spacing: 10) { ProgressView(); Text(session.loginStatus ?? "Complete sign-in in the browser, then return here.").font(.footnote) }
                    .frame(maxWidth: .infinity).padding().background(.bar)
            }
            }
        }
    }

    @ViewBuilder private func entryView(_ entry: ClaudeChatEntry) -> some View {
        switch entry.kind {
        case .activity:
            HStack(spacing: 7) { Image(systemName: "wrench.and.screwdriver").font(.caption2); Text(entry.text).font(.caption) }
                .foregroundStyle(.secondary).padding(.leading, 4)
        case .user:
            HStack { Spacer(minLength: 40); Text(entry.text).padding(12).foregroundStyle(.white).background(Color.accentColor, in: .rect(cornerRadius: 16)) }
        case .assistant:
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "sparkles").font(.caption.weight(.semibold)).foregroundStyle(.tint).padding(.top, 3)
                Text(entry.text).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
            }.padding(12).background(.quaternary.opacity(0.45), in: .rect(cornerRadius: 16))
        }
    }
}

