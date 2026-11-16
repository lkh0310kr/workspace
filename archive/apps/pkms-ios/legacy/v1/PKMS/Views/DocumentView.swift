import SwiftUI

/// Shows a note in a rendered reading view or the live-preview Markdown editor.
struct DocumentView: View {
    let path: VaultPath

    @Environment(VaultStore.self) private var store
    @Environment(SyncController.self) private var sync
    @Environment(\.openDocument) private var openDocument
    @Environment(\.openURL) private var openURL
    @State private var text: String?
    @State private var loadError: String?
    @State private var editorText = ""
    @State private var mode = DocumentMode.read
    @State private var focusOnAppear = false
    @State private var controller = EditorController()
    @State private var reviewingConflict = false
    @State private var isRenaming = false
    @State private var renameText = ""

    var body: some View {
        Group {
            if let text {
                switch mode {
                case .read:
                    ScrollView {
                        MarkdownView(blocks: MarkdownParser.parse(editorText.isEmpty ? text : editorText).blocks, lazy: true)
                            .environment(\.markdownDocumentPath, path)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .environment(\.openURL, OpenURLAction { url in
                        open(url.absoluteString)
                        return .handled
                    })
                case .edit:
                    NoteEditorView(path: path, initialText: text, focusOnAppear: focusOnAppear, text: $editorText,
                                   controller: controller, onOpenLink: open, onEndEditing: finishEditing)
                }
            } else if let loadError {
                ContentUnavailableView("Couldn’t Open Note", systemImage: "exclamationmark.triangle",
                                       description: Text(loadError))
            } else {
                ProgressView()
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { conflictBanner }
        .navigationTitle(path.baseName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 2) {
                    modeButton(.read, symbol: "book")
                    modeButton(.edit, symbol: "pencil")
                }
                .padding(3)
                .background(.thinMaterial, in: Capsule())
                .overlay(Capsule().strokeBorder(.quaternary))
                .fixedSize()
                .accessibilityLabel("Reading and editing mode")
            }
            ToolbarItem(placement: .topBarTrailing) {
                SyncStatusIcon()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Rename", systemImage: "pencil") {
                        renameText = path.baseName
                        isRenaming = true
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("More note actions")
            }
        }
        .task(id: path) {
            await load()
        }
        .onChange(of: store.revision) {
            guard mode == .read else { return }
            Task { await refreshReadContent() }
        }
        .onDisappear {
            if controller.isFocused { finishEditing() }
        }
        .sheet(isPresented: $reviewingConflict) {
            if let copy = sync.conflicts[path] {
                ConflictReviewView(path: path, remoteCopy: copy)
            }
        }
        .alert("Rename Note", isPresented: $isRenaming) {
            TextField("Name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Rename") { renameNote() }
        }
    }

    private var modeSelection: Binding<DocumentMode> {
        Binding {
            mode
        } set: { newMode in
            guard newMode != mode else { return }
            if mode == .edit, newMode == .read {
                let wasFocused = controller.isFocused
                controller.dismissKeyboard()
                if !wasFocused { finishEditing() }
                focusOnAppear = false
            }
            mode = newMode
        }
    }

    private func modeButton(_ option: DocumentMode, symbol: String) -> some View {
        Button {
            modeSelection.wrappedValue = option
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(mode == option ? Color.accentColor : Color.secondary)
                .frame(width: 32, height: 30)
                .background {
                    if mode == option {
                        Capsule().fill(Color.accentColor.opacity(0.14))
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option == .read ? "Read mode" : "Edit mode")
        .accessibilityAddTraits(mode == option ? .isSelected : [])
    }

    private func renameNote() {
        let title = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != path.baseName else { return }
        Task { try? await store.rename(path, to: title) }
    }

    @ViewBuilder
    private var conflictBanner: some View {
        if sync.conflicts[path] != nil {
            Button { reviewingConflict = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.triangle.branch")
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Also edited on another device").font(.subheadline.weight(.semibold))
                        Text("Both versions were kept. Tap to review.").font(.caption)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                }
                .foregroundStyle(.orange)
                .padding(12)
                .background(.orange.opacity(0.12), in: .rect(cornerRadius: 12))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Loading and editing

    private func load() async {
        mode = .read
        focusOnAppear = false
        text = nil
        editorText = ""
        loadError = nil
        do {
            let loaded = try await store.repository.readText(at: path)
            editorText = loaded
            if store.pendingEdit == path {
                store.pendingEdit = nil
                focusOnAppear = true
                mode = .edit
            }
            text = loaded
            store.recordView(path)
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func refreshReadContent() async {
        guard mode == .read, let disk = try? await store.repository.readText(at: path), mode == .read else { return }
        guard disk != editorText else { return }
        editorText = disk
        text = disk
    }

    /// When the keyboard goes away: name new notes after their first line and sync soon.
    private func finishEditing() {
        store.flushPendingEdits()
        sync.scheduleSync(after: .seconds(1))
        Task { await renameUntitledNote(from: editorText) }
    }

    /// New notes start as "Untitled"; once they have a first line, the file takes that as its name.
    private func renameUntitledNote(from text: String) async {
        guard path.baseName.range(of: #"^Untitled( \d+)?$"#, options: .regularExpression) != nil,
              let firstLine = text.components(separatedBy: "\n").first(where: {
                  !$0.trimmingCharacters(in: .whitespaces).isEmpty && $0.trimmingCharacters(in: .whitespaces) != "#"
              }) else { return }
        let title = firstLine.trimmingCharacters(in: CharacterSet(charactersIn: "#>-*[] ").union(.whitespaces))
        guard !title.isEmpty, title != path.baseName else { return }
        let unique = store.uniquePath(named: VaultStore.fileName(from: title, fallback: "Untitled"), extension: "md", in: path.parent).baseName
        _ = try? await store.rename(path, to: unique)
    }

    /// Routes taps on links: vault documents open in-app, web links go to the system.
    private func open(_ target: String) {
        if let wiki = WikiLink.target(in: target) {
            if let resolved = store.index.resolve(wiki, from: path, isWikiLink: true), resolved.isMarkdown {
                openDocument(resolved)
            }
            return
        }
        if let url = URL(string: target) ?? MarkdownParser.makeURL(target), url.scheme != nil {
            openURL(url)
            return
        }
        if let resolved = store.index.resolve(target, from: path, isWikiLink: false), resolved.isMarkdown {
            openDocument(resolved)
        }
    }
}

private enum DocumentMode: Hashable {
    case read
    case edit
}

/// A small cloud icon summarizing sync: uploading, waiting to upload, failed, or all synced.
struct SyncStatusIcon: View {
    @Environment(SyncController.self) private var sync

    var body: some View {
        if sync.repository != nil {
            Group {
                switch sync.status {
                case .syncing:
                    ProgressView().controlSize(.small)
                case .failed(let message):
                    Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange)
                        .accessibilityLabel("Sync failed: \(message)")
                case .idle:
                    if !sync.conflicts.isEmpty {
                        Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange)
                            .accessibilityLabel("Needs review")
                    } else if sync.hasLocalChanges {
                        Image(systemName: "icloud.and.arrow.up").foregroundStyle(.secondary)
                            .accessibilityLabel(sync.isSignedIn ? "Waiting to sync" : "Sign in to sync changes")
                    } else {
                        Image(systemName: "checkmark.icloud").foregroundStyle(.secondary)
                            .accessibilityLabel("Synced")
                    }
                }
            }
            .font(.footnote)
            .animation(.default, value: sync.isSyncing)
        }
    }
}

/// Side-by-side choice between this device's version of a note and GitHub's.
struct ConflictReviewView: View {
    let path: VaultPath
    let remoteCopy: VaultPath

    @Environment(VaultStore.self) private var store
    @Environment(SyncController.self) private var sync
    @Environment(\.dismiss) private var dismiss
    @State private var showing = 0
    @State private var local: MarkdownDocument?
    @State private var remote: MarkdownDocument?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Version", selection: $showing) {
                    Text("This Device").tag(0)
                    Text("GitHub").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()
                ScrollView {
                    if let document = showing == 0 ? local : remote {
                        MarkdownView(blocks: document.blocks)
                            .environment(\.markdownDocumentPath, path)
                            .padding(.horizontal, 20)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                VStack(spacing: 10) {
                    Button { resolve(.keepLocal) } label: {
                        Text("Keep This Device’s Version").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    Button { resolve(.keepRemote) } label: {
                        Text("Keep GitHub’s Version").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    Button("Keep Both as Separate Notes") { resolve(.keepBoth) }
                        .font(.subheadline)
                }
                .controlSize(.large)
                .padding()
                .background(.bar)
            }
            .navigationTitle(path.baseName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Later") { dismiss() } }
            }
            .task {
                local = try? await MarkdownParser.parse(store.repository.readText(at: path))
                remote = try? await MarkdownParser.parse(store.repository.readText(at: remoteCopy))
            }
        }
    }

    private func resolve(_ resolution: SyncEngine.Resolution) {
        dismiss()
        Task { await sync.resolveConflict(path, resolution) }
    }
}
