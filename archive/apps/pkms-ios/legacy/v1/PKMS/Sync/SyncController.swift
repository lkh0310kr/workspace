import Foundation
import Observation
import UIKit

/// App-facing sync state: the GitHub account, the chosen repository, and pull status.
@MainActor
@Observable
final class SyncController {
    enum Status: Equatable {
        case idle
        case syncing(done: Int, total: Int)
        case failed(String)
    }

    private(set) var token: String?
    private(set) var accountName: String?
    private(set) var repository: String?
    private(set) var branch: String
    private(set) var status: Status = .idle
    private(set) var lastSync: Date?
    private(set) var lastReport: SyncReport?
    /// Edits on this device that haven't reached GitHub yet.
    private(set) var hasLocalChanges = false

    @ObservationIgnored private var pendingSync: Task<Void, Never>?
    @ObservationIgnored private var needsAnotherSync = false

    private let vault: VaultStore
    private let vaultRoot: URL
    private let defaults = UserDefaults.standard
    private let account: GitHubAccount
    /// Matches `GitHubAccount`'s ticket so a sign-out can't delete a sign-in that won the race.
    private var accountTicket = 0

    private enum Key {
        static let account = "github.account"
        static let repository = "github.repository"
        static let branch = "github.branch"
        static let lastSync = "github.lastSync"
    }

    init(vault: VaultStore, vaultRoot: URL) {
        self.vault = vault
        self.vaultRoot = vaultRoot
        let stored = TokenStore.read()
        account = GitHubAccount(credentials: stored)
        token = stored?.accessToken
        accountName = defaults.string(forKey: Key.account)
        repository = defaults.string(forKey: Key.repository)
        branch = defaults.string(forKey: Key.branch) ?? "main"
        lastSync = defaults.object(forKey: Key.lastSync) as? Date
        loadConflicts()
        vault.onLocalChange = { [weak self] in self?.scheduleSync() }
    }

    var isSignedIn: Bool { token != nil }
    /// True when this account has authorized the app but not installed it, so private repositories stay invisible.
    private(set) var needsAppInstall = false
    var isSyncing: Bool { if case .syncing = status { true } else { false } }
    var client: GitHubClient {
        GitHubClient(token: token, account: token == nil ? nil : account)
    }

    // MARK: - Account

    /// Verifies credentials (from Device Flow or a pasted token) and stores them in the Keychain.
    func signIn(_ credentials: GitHubCredentials) async throws {
        let credentials = GitHubCredentials(
            accessToken: credentials.accessToken.trimmingCharacters(in: .whitespacesAndNewlines),
            refreshToken: credentials.refreshToken,
            accessExpiresAt: credentials.accessExpiresAt,
            refreshExpiresAt: credentials.refreshExpiresAt
        )
        let user = try await GitHubClient(token: credentials.accessToken).currentUser()
        accountTicket += 1
        await account.replace(credentials, ticket: accountTicket)
        token = credentials.accessToken
        accountName = user.login
        defaults.set(user.login, forKey: Key.account)
        // Authorization alone does not install the app, so private repositories stay hidden until it is.
        needsAppInstall = await client.hasAppInstallation() == false
    }

    func signIn(token: String) async throws {
        try await signIn(GitHubCredentials(accessToken: token))
    }

    /// Forgets the token. Notes already on this device stay.
    func signOut() {
        let ticket = accountTicket
        token = nil
        accountName = nil
        needsAppInstall = false
        defaults.removeObject(forKey: Key.account)
        Task { await account.clear(ticket: ticket) }
    }

    /// Signs out when GitHub has rejected the session and refreshing didn't help.
    func noteAuthenticationFailure(_ error: Error) {
        if let github = error as? GitHubError, case .unauthorized = github {
            signOut()
        }
    }

    // MARK: - Repository

    func select(_ repository: GitHubRepository) async {
        setRepository(repository.fullName, branch: repository.defaultBranch)
        await sync()
    }

    func setRepository(_ fullName: String?, branch: String) {
        repository = fullName
        self.branch = branch.isEmpty ? "main" : branch
        defaults.set(fullName, forKey: Key.repository)
        defaults.set(self.branch, forKey: Key.branch)
        lastReport = nil
        status = .idle
    }

    private var repositoryID: String? { repository.map { "\($0)@\(branch)" } }

    // MARK: - Sync

    /// Brings in changes from GitHub and uploads this device's edits, then refreshes the index if files changed.
    func sync() async {
        guard let repository, let repositoryID else { return }
        guard !isSyncing else {
            needsAnotherSync = true
            return
        }
        vault.flushPendingEdits()
        status = .syncing(done: 0, total: 0)
        do {
            let isNewRepository = SyncState.load()?.repository != repositoryID
            if isNewRepository {
                // Make sure the repository is reachable before replacing the local vault.
                _ = try await client.headCommit(of: repository, branch: branch)
                try replaceVault(for: repositoryID)
            }
            let report = try await engine(repository: repository, repositoryID: repositoryID).sync { done, total in
                Task { @MainActor [weak self] in
                    if self?.isSyncing == true { self?.status = .syncing(done: done, total: total) }
                }
            }
            lastReport = report
            lastSync = .now
            defaults.set(lastSync, forKey: Key.lastSync)
            hasLocalChanges = report.notUploaded > 0
            needsAppInstall = false
            status = .idle
            if report.changedVault || isNewRepository { await vault.reload() }
        } catch {
            GitHubLog.error("sync failed: \(error.localizedDescription)")
            noteAuthenticationFailure(error)
            if let github = error as? GitHubError, case .notFound = github {
                let installed = isSignedIn ? await client.hasAppInstallation() : true
                let missingInstall = isSignedIn && !installed
                needsAppInstall = missingInstall
                if !isSignedIn || missingInstall {
                    status = .failed(isSignedIn
                        ? "The GitHub App isn’t installed on this repository. Allow private repositories, choose All repositories, then sync again."
                        : "This repository is private. Sign in, then install the GitHub App on it.")
                } else {
                    status = .failed(error.localizedDescription)
                }
            } else {
                status = .failed(error.localizedDescription)
            }
            await vault.reload()  // show whatever was synced before the failure
        }
        loadConflicts()
        if needsAnotherSync {
            needsAnotherSync = false
            scheduleSync(after: .seconds(1))
        }
    }

    /// Debounced sync after the user edits something, so typing doesn't create a commit per keystroke.
    func scheduleSync(after delay: Duration = .seconds(4)) {
        hasLocalChanges = true
        guard repository != nil else { return }
        pendingSync?.cancel()
        pendingSync = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.sync()
        }
    }

    /// Syncs if the last successful sync is older than `interval`, e.g. when the app returns to the foreground.
    func syncIfStale(olderThan interval: TimeInterval = 60) async {
        if hasLocalChanges { return await sync() }
        if let lastSync, Date.now.timeIntervalSince(lastSync) < interval { return }
        await sync()
    }

    // MARK: - Conflicts

    /// Notes changed in the same place on this device and on GitHub, mapped to the saved GitHub version.
    private(set) var conflicts: [VaultPath: VaultPath] = [:]

    func resolveConflict(_ path: VaultPath, _ resolution: SyncEngine.Resolution) async {
        guard let repository, let repositoryID else { return }
        do {
            try engine(repository: repository, repositoryID: repositoryID).resolveConflict(path, resolution)
        } catch {
            status = .failed(error.localizedDescription)
        }
        loadConflicts()
        await vault.reload()
        scheduleSync(after: .seconds(1))
    }

    private func loadConflicts() {
        let state = SyncState.load()
        guard state?.repository == repositoryID else { conflicts = [:]; return }
        conflicts = Dictionary(uniqueKeysWithValues: (state?.conflicts ?? [:]).map { (VaultPath($0.key), VaultPath($0.value)) })
    }

    private func engine(repository: String, repositoryID: String) -> SyncEngine {
        SyncEngine(
            vaultRoot: vaultRoot,
            stateURL: SyncState.fileURL,
            repositoryID: repositoryID,
            remote: GitHubRemote(client: client, repository: repository, branch: branch),
            canUpload: isSignedIn,
            commitTitle: "Update notes from \(UIDevice.current.model)"
        )
    }

    /// When the vault is about to be filled from a different repository than last time,
    /// the current vault folder is moved aside to `Application Support/Backups/` rather than mixed in or deleted.
    private func replaceVault(for repositoryID: String) throws {
        let fm = FileManager.default
        let contents = (try? fm.contentsOfDirectory(atPath: vaultRoot.path(percentEncoded: false))) ?? []
        if !contents.filter({ !$0.hasPrefix(".") }).isEmpty {
            let backups = URL.applicationSupportDirectory.appending(path: "Backups", directoryHint: .isDirectory)
            try fm.createDirectory(at: backups, withIntermediateDirectories: true)
            let stamp = Date.now.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false))
                .replacingOccurrences(of: ":", with: "")
            try fm.moveItem(at: vaultRoot, to: backups.appending(path: "vault-\(stamp)"))
        }
        try fm.createDirectory(at: vaultRoot, withIntermediateDirectories: true)
        try SyncState(repository: repositoryID).save()
    }
}
