import SwiftUI

/// Navigation value for drilling into a folder. Distinct from `VaultPath` so that folder
/// links push onto the sidebar stack instead of changing the selected document.
struct FolderRoute: Hashable {
    let path: VaultPath
}

struct OpenFolderAction {
    let handler: @MainActor (FolderRoute) -> Void
    @MainActor func callAsFunction(_ route: FolderRoute) { handler(route) }
}

struct OpenNoteAction {
    let handler: @MainActor (VaultPath) -> Void
    @MainActor func callAsFunction(_ path: VaultPath) { handler(path) }
}

/// Opens another vault document on top of the current one, e.g. when a link is tapped.
struct OpenDocumentAction {
    let handler: @MainActor (VaultPath) -> Void
    @MainActor func callAsFunction(_ path: VaultPath) { handler(path) }
}

extension EnvironmentValues {
    @Entry var openFolder = OpenFolderAction { _ in }
    @Entry var openNote = OpenNoteAction { _ in }
    @Entry var openDocument = OpenDocumentAction { _ in }
}

/// Split view on iPad (files | document); collapses into a single stack on iPhone.
struct RootView: View {
    @Environment(VaultStore.self) private var store
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var compactPath = NavigationPath()
    @State private var folderStack: [FolderRoute] = []
    @State private var selection: VaultPath?
    /// Documents opened by following links from the selected document.
    @State private var linkedDocuments: [VaultPath] = []

    @ViewBuilder
    private func destination(for path: VaultPath) -> some View {
        if path.isMap {
            MapDocumentView(path: path)
        } else {
            DocumentView(path: path)
        }
    }

    var body: some View {
        Group {
            if horizontalSizeClass == .compact {
                // Use one explicit stack on iPhone instead of collapsing a split view.
                NavigationStack(path: $compactPath) {
                    FolderView(folder: .root, selection: $selection)
                        .navigationDestination(for: FolderRoute.self) { route in
                            FolderView(folder: route.path, selection: $selection)
                        }
                        .navigationDestination(for: VaultPath.self) { destination(for: $0) }
                }
                .environment(\.openDocument, OpenDocumentAction { compactPath.append($0) })
                .environment(\.openFolder, OpenFolderAction { compactPath.append($0) })
                .environment(\.openNote, OpenNoteAction { compactPath.append($0) })
            } else {
                NavigationSplitView {
                    NavigationStack(path: $folderStack) {
                        FolderView(folder: .root, selection: $selection)
                            .navigationDestination(for: FolderRoute.self) { route in
                                FolderView(folder: route.path, selection: $selection)
                            }
                    }
                    .environment(\.openFolder, OpenFolderAction { folderStack.append($0) })
                    .environment(\.openNote, OpenNoteAction { selection = $0 })
                } detail: {
                    NavigationStack(path: $linkedDocuments) {
                        Group {
                            if let selection {
                                destination(for: selection).id(selection)
                            } else {
                                ContentUnavailableView("No Document Selected", systemImage: "doc.text",
                                                       description: Text("Choose a note from the sidebar."))
                            }
                        }
                        .navigationDestination(for: VaultPath.self) { destination(for: $0) }
                    }
                    .environment(\.openDocument, OpenDocumentAction { linkedDocuments.append($0) })
                }
            }
        }
        .background(ClaudeRuntimeHost().frame(width: 1, height: 1).allowsHitTesting(false).accessibilityHidden(true))
        .onChange(of: selection) { old, new in
            // Following a rename keeps the navigation history; choosing another note resets it.
            if let move = store.lastMove, old?.movingPrefix(move.from, to: move.to) == new { return }
            linkedDocuments.removeAll()
        }
        .onChange(of: store.lastMove) { _, move in
            guard let move else { return }
            linkedDocuments = linkedDocuments.map { $0.movingPrefix(move.from, to: move.to) ?? $0 }
            folderStack = folderStack.map { FolderRoute(path: $0.path.movingPrefix(move.from, to: move.to) ?? $0.path) }
            if let moved = selection?.movingPrefix(move.from, to: move.to) { selection = moved }
        }
    }
}
