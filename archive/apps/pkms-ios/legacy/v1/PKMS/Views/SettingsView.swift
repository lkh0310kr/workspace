import SwiftUI
import UIKit

/// GitHub account, repository and sync status.
struct SettingsView: View {
    @Environment(SyncController.self) private var sync
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if sync.isSignedIn {
                        LabeledContent("Account", value: sync.accountName.map { "@\($0)" } ?? "Signed in")
                        Link("Allow private repositories", destination: GitHubAppConfig.installURL)
                        Button("Sign Out", role: .destructive) { sync.signOut() }
                    } else {
                        SignInView()
                    }
                } header: {
                    Text("GitHub")
                } footer: {
                    if sync.isSignedIn {
                        Text(sync.needsAppInstall
                            ? "This account hasn’t installed the app yet. Allow private repositories and choose All repositories."
                            : "Signing in only approves the app. Private repositories show up after you install it on your account and choose All repositories.")
                    } else {
                        Text("Sign in to sync private repositories. Public repositories work without signing in.")
                    }
                }

                Section {
                    NavigationLink {
                        RepositoryPickerView()
                    } label: {
                        LabeledContent("Repository", value: sync.repository ?? "None")
                    }
                    if sync.repository != nil {
                        LabeledContent("Branch", value: sync.branch)
                    }
                } footer: {
                    Text("Notes are stored on this device as Markdown files. Switching repositories moves the current notes into a backup folder instead of deleting them.")
                }

                if sync.repository != nil {
                    SyncStatusSection()
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}

private struct SyncStatusSection: View {
    @Environment(SyncController.self) private var sync

    var body: some View {
        Section("Sync") {
            switch sync.status {
            case .syncing(let done, let total):
                HStack {
                    Text(total > 0 ? "Downloading \(done) of \(total)…" : "Checking for changes…")
                    Spacer()
                    ProgressView()
                }
            case .failed(let message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
            case .idle:
                if let lastSync = sync.lastSync {
                    LabeledContent("Last Synced") {
                        Text(lastSync, style: .relative) + Text(" ago")
                    }
                }
            }
            if !sync.isSignedIn, sync.hasLocalChanges {
                Label("Sign in to save your edits to GitHub. They’re kept on this device until then.",
                      systemImage: "icloud.slash")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let report = sync.lastReport {
                if report.uploaded > 0 { LabeledContent("Uploaded", value: "\(report.uploaded) files") }
                if report.downloaded > 0 { LabeledContent("Downloaded", value: "\(report.downloaded) files") }
                if report.deleted > 0 { LabeledContent("Removed", value: "\(report.deleted) files") }
                if !report.merged.isEmpty {
                    DisclosureGroup("Combined edits from both places (\(report.merged.count))") {
                        ForEach(report.merged, id: \.self) { Text($0.string).font(.footnote) }
                    }
                }
            }
            if !sync.conflicts.isEmpty {
                DisclosureGroup("Needs review (\(sync.conflicts.count))") {
                    Text("Edited in the same place on this device and on GitHub. Open the note to choose a version.")
                        .font(.footnote).foregroundStyle(.secondary)
                    ForEach(sync.conflicts.keys.sorted(), id: \.self) { Text($0.string).font(.footnote) }
                }
            }
            Button("Sync Now") { Task { await sync.sync() } }
                .disabled(sync.isSyncing)
        }
    }
}

/// "Sign in with GitHub" via Device Flow, with a personal access token as a fallback.
private struct SignInView: View {
    @Environment(SyncController.self) private var sync
    @Environment(\.openURL) private var openURL

    @State private var deviceCode: GitHubDeviceFlow.DeviceCode?
    @State private var loginTask: Task<Void, Never>?
    @State private var error: String?
    @State private var showsTokenField = GitHubAppConfig.clientID.isEmpty
    @State private var tokenText = ""
    @State private var isVerifyingToken = false

    var body: some View {
        if !GitHubAppConfig.clientID.isEmpty {
            if let deviceCode {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Enter this code on GitHub:")
                        .foregroundStyle(.secondary)
                    Text(deviceCode.userCode)
                        .font(.system(.title, design: .monospaced).weight(.semibold))
                        .textSelection(.enabled)
                    HStack {
                        Button("Copy Code & Open GitHub") {
                            UIPasteboard.general.string = deviceCode.userCode
                            openURL(deviceCode.verificationUri)
                        }
                        .buttonStyle(.borderedProminent)
                        Spacer()
                        ProgressView()
                    }
                }
                .padding(.vertical, 4)
                Button("Cancel", role: .cancel) { cancelDeviceLogin() }
            } else {
                Button("Sign in with GitHub", action: startDeviceLogin)
            }
        }

        if showsTokenField {
            SecureField("Personal access token", text: $tokenText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button {
                Task { await signIn(token: tokenText) }
            } label: {
                HStack {
                    Text("Sign In with Token")
                    if isVerifyingToken { Spacer(); ProgressView() }
                }
            }
            .disabled(tokenText.isEmpty || isVerifyingToken)
            Link("Create a token on GitHub", destination: URL(string: "https://github.com/settings/tokens/new?scopes=repo&description=Vault")!)
                .font(.footnote)
        } else {
            Button("Use a Personal Access Token") { showsTokenField = true }
                .font(.footnote)
        }

        if let error {
            Text(error).font(.footnote).foregroundStyle(.red)
        }
    }

    private func startDeviceLogin() {
        error = nil
        loginTask = Task {
            do {
                let flow = GitHubDeviceFlow(clientID: GitHubAppConfig.clientID)
                let code = try await flow.start()
                deviceCode = code
                let credentials = try await flow.waitForToken(code)
                try await sync.signIn(credentials)
                openInstallPageIfNeeded()
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
            deviceCode = nil
        }
    }

    private func cancelDeviceLogin() {
        loginTask?.cancel()
        deviceCode = nil
    }

    private func signIn(token: String) async {
        isVerifyingToken = true
        defer { isVerifyingToken = false }
        do {
            try await sync.signIn(token: token)
            error = nil
            openInstallPageIfNeeded()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func openInstallPageIfNeeded() {
        guard sync.needsAppInstall else { return }
        openURL(GitHubAppConfig.installURL)
    }
}

/// Lists the account's repositories, or lets the user type `owner/name` for a public one.
private struct RepositoryPickerView: View {
    @Environment(SyncController.self) private var sync
    @Environment(\.dismiss) private var dismiss

    @State private var repositories: [GitHubRepository] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var query = ""
    @State private var manualName = ""

    var body: some View {
        List {
            Section {
                HStack {
                    TextField("owner/repository", text: $manualName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(chooseManual)
                    Button("Use", action: chooseManual)
                        .disabled(!manualName.contains("/"))
                }
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
            }

            if sync.isSignedIn {
                Section("Your Repositories") {
                    if isLoading && repositories.isEmpty {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                    ForEach(filtered) { repository in
                        Button { choose(repository) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(repository.fullName).foregroundStyle(.primary)
                                    if let description = repository.description, !description.isEmpty {
                                        Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                }
                                Spacer()
                                if repository.private { Image(systemName: "lock").foregroundStyle(.secondary) }
                                if repository.fullName == sync.repository { Image(systemName: "checkmark").foregroundStyle(.tint) }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Repository")
        .searchable(text: $query)
        .task { await load() }
        .refreshable { await load() }
    }

    private var filtered: [GitHubRepository] {
        query.isEmpty ? repositories : repositories.filter { $0.fullName.localizedCaseInsensitiveContains(query) }
    }

    private func load() async {
        guard sync.isSignedIn else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            repositories = try await sync.client.repositories()
        } catch {
            sync.noteAuthenticationFailure(error)
            self.error = error.localizedDescription
        }
    }

    private func choose(_ repository: GitHubRepository) {
        dismiss()
        Task { await sync.select(repository) }
    }

    private func chooseManual() {
        let name = manualName.trimmingCharacters(in: .whitespaces)
        guard name.contains("/") else { return }
        Task {
            do {
                choose(try await sync.client.repository(name))
            } catch {
                sync.noteAuthenticationFailure(error)
                self.error = error.localizedDescription
            }
        }
    }
}
