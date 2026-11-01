import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Lists the subfolders and Markdown documents of one vault folder.
struct FolderView: View {
    let folder: VaultPath
    @Binding var selection: VaultPath?

    @Environment(VaultStore.self) private var store
    @Environment(SyncController.self) private var sync
    @Environment(\.openFolder) private var openFolder
    @Environment(\.openNote) private var openNote
    @State private var query = ""
    @State private var showsSettings = false
    @State private var showsAgent = false
    @State private var showsOnDeviceClaude = false
    @State private var naming: NamingTask?
    @State private var nameText = ""
    @State private var pendingDelete: VaultNode?
    @State private var error: String?
    /// Folder row currently under a drag, so it can highlight as a drop target.
    @State private var dropTarget: VaultPath?

    /// What the name prompt is for.
    private enum NamingTask: Identifiable {
        case newFolder
        case rename(VaultNode)

        var id: String {
            switch self {
            case .newFolder: "new-folder"
            case .rename(let node): "rename-\(node.path)"
            }
        }
    }

    var body: some View {
        Group {
            if folder.isRoot {
                list
                    .searchable(text: $query, prompt: "Search notes")
                    .sheet(isPresented: $showsSettings) { SettingsView() }
                    .sheet(isPresented: $showsAgent) { AgentView() }
                    .sheet(isPresented: $showsOnDeviceClaude) { OnDeviceClaudeView() }
            } else {
                list
            }
        }
        .toolbar {
            if folder.isRoot {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Settings", systemImage: "gearshape") { showsSettings = true }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Codex · ChatGPT", systemImage: "sparkles") { showsAgent = true }
                        Button("Claude Code · on this iPhone", systemImage: "terminal") { showsOnDeviceClaude = true }
                    } label: {
                        Label("Agent", systemImage: "sparkles")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showsSettings = true } label: { SyncStatusIcon() }
                        .accessibilityLabel("Sync status")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("New Note", systemImage: "square.and.pencil") { createNote() }
                    Button("New Folder", systemImage: "folder.badge.plus") { startNaming(.newFolder) }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Folder actions")
            }
        }
        .alert(namingTitle, isPresented: isNaming) {
            TextField("Name", text: $nameText)
            Button("Cancel", role: .cancel) {}
            Button(namingConfirm) { commitNaming() }
        }
        .confirmationDialog(deleteTitle, isPresented: isDeleting, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { commitDelete() }
        } message: {
            Text(sync.repository != nil ? "It will also be removed from GitHub. You can recover it from the repository’s history." : "This can’t be undone.")
        }
        .alert("Something Went Wrong", isPresented: Binding { error != nil } set: { if !$0 { error = nil } }) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }

    private var node: VaultNode? { store.index.node(at: folder) }

    /// Asset-only folders (e.g. `Assets/`) are hidden from browsing; their files are still used for images.
    private var visibleChildren: [VaultNode] {
        (node?.children ?? []).filter(\.isBrowsable)
    }

    private var list: some View {
        List(selection: $selection) {
            if !query.isEmpty {
                ForEach(store.index.search(query), id: \.path.string) { file in
                    Button {
                        openNote(file.path)
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(file.displayName)
                                if !file.path.parent.isRoot {
                                    Text(file.path.parent.string).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        } icon: {
                            Image(systemName: "doc.text")
                        }
                    }
                    .buttonStyle(.plain)
                }
            } else {
                // Rows are keyed by string so only documents carry a `VaultPath` selection tag;
                // otherwise tapping a folder would select it as if it were a document.
                if folder.isRoot, !store.recentNotes.isEmpty {
                    Section("Recent") {
                        ForEach(store.recentNotes, id: \.path.string) { file in
                            recentRow(file)
                                .vaultDrag(file.path, store: store)
                        }
                    }
                }
                Section {
                    ForEach(visibleChildren, id: \.path.string) { child in
                        row(for: child)
                            .vaultDrag(child.path, store: store)
                            .vaultFolderDrop(child.isFolder, into: child.path, store: store, dropTarget: $dropTarget) { source in
                                move(source, into: child.path)
                            }
                            .listRowBackground(dropTarget == child.path ? Color.accentColor.opacity(0.22) : nil)
                            .contextMenu {
                                Button("Rename", systemImage: "pencil") { startNaming(.rename(child)) }
                                Button("Delete", systemImage: "trash", role: .destructive) { pendingDelete = child }
                            }
                            .swipeActions(edge: .trailing) {
                                Button("Delete", systemImage: "trash", role: .destructive) { pendingDelete = child }
                            }
                    }
                }
            }
        }
        .navigationTitle(node?.displayName ?? folder.name)
        .refreshable {
            if sync.repository != nil { await sync.sync() }
            await store.reload()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { parentDropBar }
        .overlay { emptyState }
    }

    /// Notes opened most recently. Shown on the vault root, the way Notion lists recent pages.
    private func recentRow(_ file: VaultNode) -> some View {
        Button {
            openNote(file.path)
        } label: {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(file.displayName)
                    if !file.path.parent.isRoot {
                        Text(locationTitle(file.path.parent))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } icon: {
                Image(systemName: "doc.text")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func locationTitle(_ path: VaultPath) -> String {
        if path.isRoot { return "Vault" }
        return store.index.node(at: path)?.displayName ?? path.string
    }

    @ViewBuilder
    private func row(for child: VaultNode) -> some View {
        if child.isFolder {
            Button {
                openFolder(FolderRoute(path: child.path))
            } label: {
                HStack(spacing: 10) {
                    Label(child.displayName, systemImage: "folder")
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // Folders push through openFolder; they are never list selections.
            .tag(Optional<VaultPath>.none)
        } else {
            Button {
                openNote(child.path)
            } label: {
                Label {
                    Text(child.displayName)
                } icon: {
                    Image(systemName: sync.conflicts[child.path] != nil ? "exclamationmark.triangle" : child.kind == .map ? "map" : "doc.text")
                        .foregroundStyle(sync.conflicts[child.path] != nil ? AnyShapeStyle(.orange) : AnyShapeStyle(.tint))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if !query.isEmpty, store.index.search(query).isEmpty {
            ContentUnavailableView.search(text: query)
        } else if query.isEmpty, visibleChildren.isEmpty, !showsRecent {
            if store.isLoading {
                ProgressView()
            } else if let error = store.loadError {
                ContentUnavailableView("Couldn’t Open Vault", systemImage: "exclamationmark.triangle",
                                       description: Text(error))
            } else {
                ContentUnavailableView {
                    Label("No Notes", systemImage: "square.and.pencil")
                } description: {
                    Text("Notes you create here are saved as Markdown files.")
                } actions: {
                    Button("New Note") { createNote() }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    private var showsRecent: Bool { folder.isRoot && query.isEmpty && !store.recentNotes.isEmpty }

    /// A bar under the list, only while dragging, for moving the item up to the parent folder.
    /// It stays out of the row list so it doesn't shift the folder under the finger.
    @ViewBuilder
    private var parentDropBar: some View {
        if query.isEmpty, !folder.isRoot, let source = store.draggedPath, store.canMove(source, into: folder.parent) {
            let title = locationTitle(folder.parent)
            Text("Move to \(title)")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(dropTarget == folder.parent ? Color.accentColor.opacity(0.28) : Color.accentColor.opacity(0.12), in: .rect(cornerRadius: 12))
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
                .vaultFolderDrop(true, into: folder.parent, store: store, dropTarget: $dropTarget) { source in
                    move(source, into: folder.parent)
                }
        }
    }

    private func move(_ source: VaultPath, into destination: VaultPath) {
        Task {
            do {
                try await store.move(source, into: destination)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Actions

    private func createNote() {
        Task {
            do {
                selection = try await store.createNote(in: folder)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func startNaming(_ task: NamingTask) {
        switch task {
        case .newFolder: nameText = ""
        case .rename(let node): nameText = node.displayName
        }
        naming = task
    }

    private var isNaming: Binding<Bool> {
        Binding { naming != nil } set: { if !$0 { naming = nil } }
    }

    private var namingTitle: String {
        switch naming {
        case .rename: "Rename"
        default: "New Folder"
        }
    }

    private var namingConfirm: String {
        switch naming {
        case .rename: "Rename"
        default: "Create"
        }
    }

    private func commitNaming() {
        guard let task = naming else { return }
        let name = nameText
        Task {
            do {
                switch task {
                case .newFolder:
                    _ = try await store.createFolder(named: name, in: folder)
                case .rename(let node):
                    try await store.rename(node.path, to: name)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private var isDeleting: Binding<Bool> {
        Binding { pendingDelete != nil } set: { if !$0 { pendingDelete = nil } }
    }

    private var deleteTitle: String {
        guard let pendingDelete else { return "" }
        return pendingDelete.isFolder
            ? "Delete “\(pendingDelete.displayName)” and everything in it?"
            : "Delete “\(pendingDelete.displayName)”?"
    }

    private func commitDelete() {
        guard let node = pendingDelete else { return }
        if let selection, selection.hasPrefix(node.path) { self.selection = nil }
        Task {
            do {
                try await store.delete(node.path)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

private extension View {
    /// Starts a same-app drag. The path is kept on the store so the drop lands on the row under the finger, not on whatever the pasteboard resolves to.
    func vaultDrag(_ path: VaultPath, store: VaultStore) -> some View {
        onDrag {
            store.draggedPath = path
            let payload = VaultDragPayload(path: path.string) { [store] in
                if store.draggedPath == path { store.draggedPath = nil }
            }
            return NSItemProvider(object: payload)
        }
    }

    /// Accepts a drop only when `enabled` (folder rows and the parent bar). A miss on a note does not count as a move.
    @ViewBuilder
    func vaultFolderDrop(
        _ enabled: Bool,
        into destination: VaultPath,
        store: VaultStore,
        dropTarget: Binding<VaultPath?>,
        perform: @escaping (VaultPath) -> Void
    ) -> some View {
        if enabled {
            onDrop(of: [UTType.utf8PlainText], isTargeted: Binding(
                get: { dropTarget.wrappedValue == destination },
                set: { targeted in
                    let allowed = targeted && store.draggedPath.map { store.canMove($0, into: destination) } == true
                    if allowed {
                        if dropTarget.wrappedValue != destination {
                            dropTarget.wrappedValue = destination
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    } else if dropTarget.wrappedValue == destination {
                        dropTarget.wrappedValue = nil
                    }
                }
            )) { _ in
                guard let source = store.draggedPath, store.canMove(source, into: destination) else { return false }
                store.draggedPath = nil
                dropTarget.wrappedValue = nil
                perform(source)
                return true
            }
        } else {
            self
        }
    }
}

/// Drag payload for a vault path. Releasing it (drop or cancel) clears the in-memory drag if this path is still current.
private final class VaultDragPayload: NSObject, NSItemProviderWriting {
    static var writableTypeIdentifiersForItemProvider: [String] { [UTType.utf8PlainText.identifier] }

    let path: String
    private let onEnd: @MainActor () -> Void

    init(path: String, onEnd: @escaping @MainActor () -> Void) {
        self.path = path
        self.onEnd = onEnd
    }

    deinit {
        let end = onEnd
        Task { @MainActor in
            // The drop handler reads the path in the same moment the system releases this payload.
            try? await Task.sleep(for: .milliseconds(400))
            end()
        }
    }

    func loadData(
        withTypeIdentifier typeIdentifier: String,
        forItemProviderCompletionHandler completionHandler: @escaping @Sendable (Data?, (any Error)?) -> Void
    ) -> Progress? {
        completionHandler(Data(path.utf8), nil)
        return nil
    }
}
