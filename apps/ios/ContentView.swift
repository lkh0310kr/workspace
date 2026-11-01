import SwiftUI
import QuickLook
import SafariServices
import UniformTypeIdentifiers
import UIKit

private struct FileTreeRow: Identifiable {
    let file: PKMSFile
    let depth: Int
    var id: String { file.id }
}

struct ContentView: View {
    @Environment(PKMSModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showingRepositories = false
    @State private var showingSettings = false
    @State private var showingFileImporter = false
    @State private var showingVerificationBrowser = false
    @State private var compactPath: [String] = []
    @State private var copiedDeviceCode: String?

    var body: some View {
        Group {
            if horizontalSizeClass == .compact {
                NavigationStack(path: $compactPath) {
                    compactRoot
                        .navigationDestination(for: String.self) { fileID in
                            if fileID.hasPrefix("folder:") {
                                folderContents(String(fileID.dropFirst("folder:".count)))
                            } else if model.activeFile?.id == fileID, model.activeFile?.isMarkdown == true {
                                markdownEditor
                            } else if let file = model.files.first(where: { $0.id == fileID }) {
                                ContentUnavailableView(entryName(file.path), systemImage: "paperclip", description: Text("This file is ready to preview."))
                            } else {
                                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                }
            } else {
                NavigationSplitView {
                    sidebar
                } detail: {
                    detailPane
                }
                .navigationSplitViewStyle(.balanced)
            }
        }
        .tint(Color.accentColor)
        .alert("PKMS", isPresented: errorPresented) {
            Button("OK") { model.dismissError() }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .fileImporter(isPresented: $showingFileImporter, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first { Task { await model.upload(url) } }
        }
        .sheet(isPresented: $showingRepositories) { repositoryPicker }
        .sheet(isPresented: $showingSettings) { settingsForm }
        .sheet(isPresented: $showingVerificationBrowser) {
            if let url = model.verificationURL { SafariVerificationSheet(url: url) }
        }
        .sheet(isPresented: previewPresented, onDismiss: { model.dismissPreview() }) {
            if let url = model.previewURL { QuickLookSheet(url: url) }
        }
        .onChange(of: model.deviceCode) { _, code in
            guard let code else { return }
            UIPasteboard.general.string = code
            copiedDeviceCode = code
        }
    }

    @ViewBuilder private var compactRoot: some View {
        if model.isRestoringSession {
            ProgressView("Connecting…").frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.user == nil {
            signIn
        } else if model.activeWorkspace == nil {
            emptyWorkspace
        } else {
            compactBrowser
        }
    }

    private var compactBrowser: some View {
        List {
            Section("Workspaces") {
                ForEach(model.workspaces) { workspace in
                    Button {
                        compactPath.removeAll()
                        Task { await model.selectWorkspace(workspace) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "externaldrive").foregroundStyle(.secondary)
                            Text(workspace.repository).lineLimit(1)
                            Spacer()
                            if model.activeWorkspace?.id == workspace.id {
                                Image(systemName: "checkmark").font(.caption.weight(.semibold)).foregroundStyle(.tint)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            Section(model.activeWorkspace?.repository ?? "Files") {
                if treeRows.isEmpty && model.isLoading {
                    ProgressView("Loading files…").frame(maxWidth: .infinity, alignment: .leading)
                        .listRowBackground(Color.clear)
                } else if treeRows.isEmpty {
                    ContentUnavailableView {
                        Label("No files yet", systemImage: "doc.text")
                    } description: {
                        Text("Create a note to get started.")
                    } actions: {
                        Button("New note", systemImage: "square.and.pencil") { Task { await model.createNote() } }
                    }
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(treeRows) { row in
                        compactFileRow(row)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .environment(\.defaultMinListRowHeight, 36)
        .navigationTitle(model.activeWorkspace?.repository ?? "Workspace")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Menu {
                    Button("New note", systemImage: "square.and.pencil") { Task { await model.createNote() } }
                    Button("New folder", systemImage: "folder.badge.plus") { Task { await model.createFolder() } }
                    Button("Upload file", systemImage: "arrow.up.doc") { showingFileImporter = true }
                    Button("Connect repository", systemImage: "plus") { openRepositories() }
                } label: { Image(systemName: "plus").accessibilityLabel("Create or connect") }
                Button { showingSettings = true } label: { Image(systemName: "gearshape").accessibilityLabel("Settings") }
            }
        }
    }

    private func compactFileRow(_ row: FileTreeRow) -> some View {
        let file = row.file
        return HStack(spacing: 0) {
            Color.clear.frame(width: CGFloat(row.depth) * 16, height: 1)
            if file.kind == "folder" {
                Button {
                    Task { await model.toggleFolder(file) }
                } label: {
                    Image(systemName: model.expandedFolders.contains(file.path) ? "chevron.down" : "chevron.right")
                        .font(.caption2.weight(.semibold)).frame(width: 28, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button {
                    Task {
                        await model.openFolder(file)
                        compactPath.append("folder:\(file.path)")
                    }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: model.expandedFolders.contains(file.path) ? "folder.fill" : "folder")
                            .foregroundStyle(.secondary)
                        Text(entryName(file.path)).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    Task {
                        await model.open(file)
                        if file.isMarkdown { compactPath.append(file.id) }
                    }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: file.isMarkdown ? "doc.text" : "paperclip")
                            .frame(width: 20).foregroundStyle(file.isMarkdown ? Color.accentColor : Color.secondary)
                        Text(entryName(file.path)).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.dismissError() } })
    }

    private var previewPresented: Binding<Bool> {
        Binding(get: { model.previewURL != nil }, set: { if !$0 { model.dismissPreview() } })
    }

    private var sidebar: some View {
        List {
            if model.user != nil {
                if !model.workspaces.isEmpty {
                    Section("Workspaces") {
                        ForEach(model.workspaces) { workspace in
                            Button {
                                Task { await model.selectWorkspace(workspace) }
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "externaldrive")
                                        .foregroundStyle(.secondary)
                                        .frame(width: 20)
                                    Text(workspace.repository).lineLimit(1)
                                    Spacer(minLength: 4)
                                    if model.activeWorkspace?.id == workspace.id {
                                        Image(systemName: "checkmark").font(.caption.weight(.semibold)).foregroundStyle(.tint)
                                    }
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(model.activeWorkspace?.id == workspace.id ? Color.accentColor.opacity(0.1) : nil)
                        }
                    }
                }

                Section(model.activeWorkspace?.repository ?? "Files") {
                    if model.activeWorkspace == nil {
                        Text("Connect a repository to get started")
                            .font(.subheadline).foregroundStyle(.secondary)
                    } else if treeRows.isEmpty {
                        if model.isLoading {
                            ProgressView().frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Text("No files yet").font(.subheadline).foregroundStyle(.secondary)
                        }
                    } else {
                        ForEach(treeRows) { row in fileRow(row) }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .environment(\.defaultMinListRowHeight, 36)
        .navigationTitle("Workspace")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if model.user != nil {
                    Menu {
                        Button("New note", systemImage: "square.and.pencil") { Task { await model.createNote() } }
                            .disabled(model.activeWorkspace == nil)
                        Button("New folder", systemImage: "folder.badge.plus") { Task { await model.createFolder() } }
                            .disabled(model.activeWorkspace == nil)
                        Button("Upload file", systemImage: "arrow.up.doc") { showingFileImporter = true }
                            .disabled(model.activeWorkspace == nil)
                        Button("Connect repository", systemImage: "plus") { openRepositories() }
                    } label: {
                        Image(systemName: "plus").accessibilityLabel("Create or connect")
                    }
                }
                Button { showingSettings = true } label: {
                    Image(systemName: "gearshape").accessibilityLabel("Settings")
                }
            }
        }
    }

    private var treeRows: [FileTreeRow] { fileRows(in: "") }

    private func fileRows(in directory: String) -> [FileTreeRow] {
        let children = Dictionary(grouping: model.files) { parentPath($0.path) }
        var rows: [FileTreeRow] = []
        func append(_ parent: String, depth: Int) {
            let items = (children[parent] ?? []).sorted {
                if ($0.kind == "folder") != ($1.kind == "folder") { return $0.kind == "folder" }
                return entryName($0.path).localizedStandardCompare(entryName($1.path)) == .orderedAscending
            }
            for file in items {
                rows.append(FileTreeRow(file: file, depth: depth))
                if file.kind == "folder", model.expandedFolders.contains(file.path) { append(file.path, depth: depth + 1) }
            }
        }
        append(directory, depth: 0)
        return rows
    }

    private func fileRow(_ row: FileTreeRow) -> some View {
        let file = row.file
        return HStack(spacing: 0) {
            Color.clear.frame(width: CGFloat(row.depth) * 14, height: 1)
            if file.kind == "folder" {
                Button {
                    Task { await model.toggleFolder(file) }
                } label: {
                    Image(systemName: model.expandedFolders.contains(file.path) ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold)).frame(width: 26, height: 34)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button {
                    Task { await model.openFolder(file) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: model.expandedFolders.contains(file.path) ? "folder.fill" : "folder")
                            .foregroundStyle(.secondary)
                        Text(entryName(file.path)).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .font(.subheadline).frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    Task { await model.open(file) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: file.isMarkdown ? "doc.text" : "paperclip")
                            .frame(width: 20).foregroundStyle(file.isMarkdown ? Color.accentColor : Color.secondary)
                        Text(entryName(file.path)).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .font(.subheadline).frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
        .listRowSeparator(.hidden)
        .listRowBackground(
            model.activeFile?.id == file.id || model.activeFolderPath == file.path
                ? Color.accentColor.opacity(0.12) : nil
        )
    }

    @ViewBuilder private var detailPane: some View {
        if model.isRestoringSession {
            ProgressView("Connecting…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.user == nil {
            signIn
        } else if model.activeFile?.isMarkdown == true {
            markdownEditor
        } else if let folder = model.activeFolderPath {
            folderContents(folder)
        } else if model.activeWorkspace == nil {
            emptyWorkspace
        } else if let file = model.activeFile {
            ContentUnavailableView(entryName(file.path), systemImage: "paperclip", description: Text("This file is ready to preview."))
        } else {
            workspaceHome
        }
    }

    private func folderContents(_ path: String) -> some View {
        List {
            Section {
                let rows = fileRows(in: path)
                if rows.isEmpty {
                    ContentUnavailableView("This folder is empty", systemImage: "folder", description: Text("There are no items here yet."))
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(rows) { row in
                        if horizontalSizeClass == .compact { compactFileRow(row) }
                        else { fileRow(row) }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .environment(\.defaultMinListRowHeight, 36)
        .navigationTitle(entryName(path))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("New note", systemImage: "square.and.pencil") { Task { await model.createNote() } }
                    Button("New folder", systemImage: "folder.badge.plus") { Task { await model.createFolder() } }
                    Button("Upload file", systemImage: "arrow.up.doc") { showingFileImporter = true }
                } label: { Image(systemName: "plus").accessibilityLabel("Create") }
            }
        }
    }

    private var workspaceHome: some View {
        ContentUnavailableView {
            Label(model.activeWorkspace?.repository ?? "Workspace", systemImage: "doc.text")
        } description: {
            Text("Open a note or create one to get started.")
        } actions: {
            Button("New note", systemImage: "square.and.pencil") { Task { await model.createNote() } }
                .buttonStyle(.borderedProminent)
        }
        .navigationTitle(model.activeWorkspace?.repository ?? "Workspace")
    }

    private var emptyWorkspace: some View {
        VStack(spacing: 18) {
            Image(systemName: "externaldrive.badge.plus")
                .font(.system(size: 36, weight: .regular)).foregroundStyle(.secondary)
            Text("Connect a GitHub repository")
                .font(.title2.weight(.semibold))
            Text("Your Markdown files appear here and stay in sync with GitHub.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary).frame(maxWidth: 340)
            Button("Choose repository") { openRepositories() }
                .buttonStyle(.borderedProminent)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Workspace")
    }

    private var markdownEditor: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Text(model.activeWorkspace?.repository ?? "Workspace").lineLimit(1)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                Text(model.activeFile.map { entryName($0.path) } ?? "Note").lineLimit(1)
                Spacer()
            }
            .font(.subheadline).foregroundStyle(.secondary)
            .padding(.horizontal, 22).padding(.top, 14).padding(.bottom, 10)

            TextEditor(text: Binding(get: { model.markdown }, set: { model.editMarkdown($0) }))
                .font(.system(size: 18, weight: .regular, design: .default))
                .lineSpacing(7)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Markdown editor")
                .background(Color(uiColor: .systemBackground))

            HStack(spacing: 8) {
                Circle().fill(model.githubStatus == "synced" ? Color.green : Color.orange).frame(width: 7, height: 7)
                Text(syncLabel).lineLimit(1)
                Spacer()
                if model.collaborators.count > 1 {
                    Label("\(model.collaborators.count)", systemImage: "person.2")
                }
            }
            .font(.caption).foregroundStyle(.secondary)
            .padding(.horizontal, 18).padding(.vertical, 11)
            .background(.bar)
        }
        .navigationTitle(model.activeFile.map { entryName($0.path) } ?? "Note")
    }

    private var syncLabel: String {
        if model.githubStatus == "synced" { return "Synced with GitHub" }
        if model.pendingFiles > 0 { return "\(model.pendingFiles) changes · syncing" }
        return model.githubStatus.capitalized
    }

    private var repositoryPicker: some View {
        NavigationStack {
            Group {
                if model.repositories.isEmpty {
                    ContentUnavailableView("No writable repositories", systemImage: "externaldrive", description: Text("GitHub did not return any repositories you can edit."))
                } else {
                    List(model.repositories) { repository in
                        Button {
                            Task { await model.connect(repository); showingRepositories = false }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: repository.private ? "lock" : "globe.americas")
                                    .foregroundStyle(.secondary).frame(width: 22)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(repository.fullName).foregroundStyle(.primary)
                                    Text("\(repository.private ? "Private" : "Public") · \(repository.defaultBranch)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Connect repository")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { showingRepositories = false } } }
        }
    }

    private var settingsForm: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("https://pkms-cloud.lkh0310kr.workers.dev", text: Binding(get: { model.serverAddress }, set: { model.serverAddress = $0 }))
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                }
                if let user = model.user {
                    Section("GitHub") {
                        LabeledContent("Signed in as", value: user.login)
                        Button("Sign out", role: .destructive) { Task { await model.signOut() } }
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { showingSettings = false } } }
        }
    }

    private var signIn: some View {
        VStack(spacing: 22) {
            Image(systemName: "doc.text")
                .font(.system(size: 34, weight: .regular)).foregroundStyle(.tint)
                .frame(width: 72, height: 72).background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 20))
            VStack(spacing: 8) {
                Text("Your workspace, everywhere")
                    .font(.system(.largeTitle, design: .rounded, weight: .semibold)).multilineTextAlignment(.center)
                Text("Sign in with GitHub to open and edit your Markdown files.")
                    .font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 330)
            }

            if let code = model.deviceCode {
                VStack(spacing: 14) {
                    Text("Enter this code on GitHub")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Text(code).font(.system(size: 30, weight: .semibold, design: .monospaced))
                        .tracking(3).textSelection(.enabled).padding(.vertical, 12)
                        .frame(maxWidth: 300).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                    Button {
                        UIPasteboard.general.string = code
                        copiedDeviceCode = code
                    } label: {
                        Label(copiedDeviceCode == code ? "Code copied" : "Copy code",
                              systemImage: copiedDeviceCode == code ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(.bordered)
                    if model.verificationURL != nil {
                        Button("Open GitHub") { showingVerificationBrowser = true }
                            .buttonStyle(.borderedProminent)
                    }
                    ProgressView("Waiting for authorization")
                        .font(.footnote).tint(.secondary)
                }
                .padding(.top, 6)
            } else {
                Button {
                    Task { await model.beginSignIn() }
                } label: {
                    Group {
                        if model.isSigningIn {
                            HStack(spacing: 9) { ProgressView().tint(.white); Text("Connecting…") }
                        } else {
                            Label("Continue with GitHub", systemImage: "arrow.up.right")
                        }
                    }
                    .font(.headline).frame(maxWidth: 300).padding(.vertical, 5)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(model.isSigningIn)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("PKMS")
    }

    private func openRepositories() {
        Task {
            await model.loadRepositories()
            showingRepositories = true
        }
    }

    private func parentPath(_ path: String) -> String {
        guard let slash = path.lastIndex(of: "/") else { return "" }
        return String(path[..<slash])
    }

    private func entryName(_ path: String) -> String {
        String(path.split(separator: "/").last ?? Substring(path))
    }
}

private struct QuickLookSheet: UIViewControllerRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: QLPreviewController, context: Context) { controller.reloadData() }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    }
}

private struct SafariVerificationSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
