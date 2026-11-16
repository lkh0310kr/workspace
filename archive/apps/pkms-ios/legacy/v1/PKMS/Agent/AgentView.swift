import SwiftUI
import UIKit
import AuthenticationServices

struct AgentView: View {
    @Environment(VaultStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var auth = CodexAuth()
    @State private var session: AgentSession?
    @State private var draft = ""
    @State private var authSession: ASWebAuthenticationSession?
    @State private var authPresentationContext = AuthSessionPresentationContext()
    @State private var showsPrivacy = false

    var body: some View {
        NavigationStack {
            Group {
                if let session {
                    conversation(session)
                } else {
                    signInPrompt
                }
            }
            .navigationTitle("Codex")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text("Codex").font(.headline)
                        Text(auth.credentials.map { "GPT-6.1 Sol · \($0.email)" } ?? "GPT-6.1 Sol · ChatGPT login").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                if auth.isSignedIn {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Privacy", systemImage: "hand.raised") { showsPrivacy = true }
                    }
                }
                if auth.isSignedIn {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Sign Out") { auth.signOut(); session = nil }
                    }
                }
            }
        }
        .task(id: auth.isSignedIn) {
            guard auth.isSignedIn else {
                session = nil
                return
            }
            await AgentDataPolicy.prepareFileIfNeeded(in: store)
            session = AgentSession(store: store, auth: auth)
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn { closeAuthSession() }
        }
        .onChange(of: auth.didReceiveCallback) { _, received in
            if received { closeAuthSession() }
        }
        .sheet(isPresented: $showsPrivacy, onDismiss: {
            // A previous tool result can remain in the model conversation. Start a clean
            // conversation after changing/inspecting exclusions so future requests cannot resend it.
            if auth.isSignedIn { session = AgentSession(store: store, auth: auth) }
        }) {
            AgentPrivacyView()
                .presentationDetents([.medium, .large])
        }
    }

    private var signInPrompt: some View {
        VStack(spacing: 18) {
            Image(systemName: "sparkles").font(.system(size: 38)).foregroundStyle(.tint)
            Text("Use Codex with your PKMS")
                .font(.title3.weight(.semibold))
            Text("Sign in with ChatGPT to use Codex on this vault. PKMS reads and edits files on this iPhone. When Codex searches or reads notes, the matching excerpts are sent to OpenAI to answer you. Edits are only saved after you approve them.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            Label("No shell or arbitrary command execution", systemImage: "iphone")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button {
                Task { await auth.signIn { openAuthSession(url: $0) } }
            } label: {
                HStack {
                    if auth.isSigningIn { ProgressView().tint(.white) }
                    Text(auth.didReceiveCallback ? "Finishing sign-in…" : (auth.isSigningIn ? "Waiting for ChatGPT…" : "Continue with ChatGPT"))
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(auth.isSigningIn)
            if let error = auth.error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func conversation(_ session: AgentSession) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(session.entries) { entry in
                            message(entry)
                                .id(entry.id)
                        }
                        ForEach(session.proposals) { proposal in
                            proposalCard(proposal, session: session)
                        }
                        if session.isSending {
                            HStack(spacing: 8) {
                                ProgressView().controlSize(.small)
                                Text("Thinking…").font(.caption).foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 12)
                            .id("agent-working")
                        }
                        if let error = session.error {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: session.entries.count) { _, _ in
                    if let last = session.entries.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
                .onChange(of: session.isSending) { _, sending in
                    if sending { withAnimation { proxy.scrollTo("agent-working", anchor: .bottom) } }
                }
            }

            Divider()
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Ask about your notes…", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                    .disabled(session.isSending)
                    .onSubmit { send(session) }
                Button { send(session) } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isSending)
                .accessibilityLabel("Send")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.bar)
        }
    }

    @ViewBuilder
    private func message(_ entry: AgentChatEntry) -> some View {
        switch entry.kind {
        case .activity:
            HStack(spacing: 7) {
                Image(systemName: "wrench.and.screwdriver").font(.caption2)
                Text(entry.text).font(.caption)
            }
            .foregroundStyle(.secondary)
            .padding(.leading, 4)
        case .user:
            HStack {
                Spacer(minLength: 40)
                Text(entry.text)
                    .padding(12)
                    .foregroundStyle(.white)
                    .background(Color.accentColor, in: .rect(cornerRadius: 16))
            }
        case .assistant:
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tint)
                    .padding(.top, 3)
                Text(entry.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .background(.quaternary.opacity(0.45), in: .rect(cornerRadius: 16))
        }
    }

    private func proposalCard(_ proposal: AgentProposal, session: AgentSession) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: proposal.kind == .create ? "doc.badge.plus" : "pencil.line")
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(proposal.kind == .create ? "New note proposal" : "Edit proposal")
                        .font(.subheadline.weight(.semibold))
                    Text(proposal.path.string).font(.caption).foregroundStyle(.secondary)
                }
            }
            DisclosureGroup("Preview proposed Markdown") {
                if let original = proposal.original {
                    Text("Current").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Text(String(original.prefix(5000)))
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Divider()
                }
                Text("Proposed").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text(String(proposal.proposed.prefix(5000)))
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack {
                Button("Discard", role: .destructive) { session.discard(proposal) }
                    .buttonStyle(.bordered)
                Spacer()
                Button("Apply") { Task { await session.apply(proposal) } }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(14)
        .background(.thinMaterial, in: .rect(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.accentColor.opacity(0.3)))
    }

    private func send(_ session: AgentSession) {
        let text = draft
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        draft = ""
        Task { await session.send(text) }
    }

    private func openAuthSession(url: URL) {
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: nil) { _, error in
            guard error != nil else { return }
            Task { @MainActor in
                if !auth.didReceiveCallback { auth.cancelSignIn() }
            }
        }
        session.presentationContextProvider = authPresentationContext
        session.prefersEphemeralWebBrowserSession = true
        authSession = session
        if !session.start() {
            authSession = nil
            auth.cancelSignIn()
        }
    }

    private func closeAuthSession() {
        authSession?.cancel()
        authSession = nil
    }
}

private struct AgentPrivacyView: View {
    @Environment(VaultStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var rules = "Loading the connected vault’s .aiignore…"
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $rules)
                        .font(.system(.footnote, design: .monospaced))
                        .frame(minHeight: 180)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text(".aiignore · PKMS root")
                } footer: {
                    Text("This edits the hidden .aiignore file in your PKMS vault root. Matching Markdown files are skipped by search and blocked from reads and edits. It syncs with the vault like other files. Prompts and note excerpts the agent reads are sent to OpenAI. PKMS sets store: false so Responses are not saved for later retrieval; this does not mean the request is processed on-device.")
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                Section {
                    Label("Changes clear this chat’s model context", systemImage: "arrow.counterclockwise")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Agent Privacy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            do {
                                try store.save(rules, to: AgentDataPolicy.configPath)
                                await store.reload()
                                dismiss()
                            } catch { self.error = error.localizedDescription }
                        }
                    }
                }
            }
            .task {
                do {
                    rules = try await AgentDataPolicy.readRules(from: store.repository)
                } catch { self.error = error.localizedDescription }
            }
        }
    }
}

private final class AuthSessionPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
