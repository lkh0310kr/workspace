import SwiftUI
import UIKit

/// Edits one note. Changes are saved automatically shortly after typing pauses, and
/// changes arriving from sync are merged into the open editor.
struct NoteEditorView: View {
    let path: VaultPath
    let initialText: String
    var focusOnAppear = false
    /// Latest text, kept for the parent.
    @Binding var text: String
    /// Controls owned by the parent (e.g. a Done button), so it's passed in.
    let controller: EditorController
    var onOpenLink: (String) -> Void = { _ in }
    var onEndEditing: () -> Void = {}

    @Environment(VaultStore.self) private var store
    @State private var widgets = WidgetCache()
    @State private var saveTask: Task<Void, Never>?
    @State private var lastSaved: String?
    @State private var flushID = UUID()

    var body: some View {
        MarkdownEditorView(initialText: initialText, controller: controller, widgets: widgets) { newText in
            text = newText
            scheduleSave()
        }
        .environment(\.markdownDocumentPath, path)
        .ignoresSafeArea(.container, edges: .bottom)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if controller.isFocused {
                VStack(spacing: 0) {
                    SuggestionList(controller: controller)
                    FormattingBar(controller: controller)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.2), value: controller.isFocused)
        .animation(.snappy(duration: 0.2), value: controller.suggestion?.kind)
        .onAppear {
            lastSaved = initialText
            text = initialText
            store.registerFlush(flushID) { saveNow() }
            controller.onSuggestionReturn = { chooseHighlightedSuggestion() }
            controller.onOpenLink = onOpenLink
            controller.onEndEditing = {
                saveNow()
                onEndEditing()
            }
            widgets.loadImage = { [store, path] source in await Self.loadImage(source, from: path, store: store) }
            if focusOnAppear {
                Task {
                    try? await Task.sleep(for: .milliseconds(350))
                    controller.focus(atEnd: true)
                }
            }
        }
        .onDisappear {
            saveNow()
            store.unregisterFlush(flushID)
        }
        .onChange(of: store.revision) {
            widgets.invalidateImages()
            mergeChangesFromDisk()
        }
    }

    // MARK: - Images

    /// Loads an image referenced from the note: a vault file (relative path or wiki embed) or a web URL.
    private static func loadImage(_ source: String, from path: VaultPath, store: VaultStore) async -> UIImage? {
        let data: Data?
        if let url = URL(string: source), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            data = try? await URLSession.shared.data(from: url).0
        } else {
            let wikiTarget = WikiLink.target(in: source)
            guard let resolved = store.index.resolve(wikiTarget ?? source, from: path, isWikiLink: wikiTarget != nil) else { return nil }
            data = try? await store.repository.readData(at: resolved)
        }
        guard let data else { return nil }
        return await Task.detached(priority: .userInitiated) { UIImage(data: data)?.preparingForDisplay() }.value
    }

    // MARK: - Saving

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            saveNow()
        }
    }

    private func saveNow() {
        saveTask?.cancel()
        let current = controller.text
        guard current != lastSaved else { return }
        do {
            try store.save(current, to: path)
            lastSaved = current
        } catch {
            // Keep the text in the editor; the next change retries the save.
        }
    }

    /// Sync may have rewritten this file. Bring those changes in without losing anything typed since.
    private func mergeChangesFromDisk() {
        Task {
            guard let disk = try? await store.repository.readText(at: path), disk != lastSaved,
                  let base = lastSaved else { return }
            let mine = controller.text
            let merged = mine == base ? disk : (TextMerge.merge(base: base, local: mine, remote: disk) ?? mine)
            lastSaved = disk
            if merged != mine { controller.replaceAllText(with: merged) }
            if merged != disk { scheduleSave() }
        }
    }

    // MARK: - Suggestions

    private func chooseHighlightedSuggestion() -> Bool {
        guard let context = controller.suggestion else { return false }
        switch context.kind {
        case .command:
            let commands = SlashCommand.matching(context.query)
            guard commands.indices.contains(controller.highlightedSuggestion) else { return false }
            controller.chooseCommand(commands[controller.highlightedSuggestion])
        case .page:
            let pages = PageSuggestions.matching(context.query, in: store.index, excluding: path)
            guard pages.indices.contains(controller.highlightedSuggestion) else { return false }
            controller.choosePage(pages[controller.highlightedSuggestion].path.baseName)
        }
        return true
    }
}

enum PageSuggestions {
    static func matching(_ query: String, in index: FileIndex, excluding current: VaultPath) -> [VaultNode] {
        let files = index.markdownFiles.filter { $0.path != current }
        let matches = query.isEmpty ? files : files.filter { $0.path.baseName.localizedStandardContains(query) }
        return Array(matches.prefix(8))
    }
}

/// The "/" block menu or `[[` page list, shown just above the formatting bar.
private struct SuggestionList: View {
    let controller: EditorController
    @Environment(VaultStore.self) private var store
    @Environment(\.markdownDocumentPath) private var documentPath

    var body: some View {
        if let context = controller.suggestion {
            let rows = rows(for: context)
            if !rows.isEmpty {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(context.kind == .command ? "Basic blocks" : "Link to page")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color(.secondaryLabel))
                                .padding(.horizontal, 14)
                                .padding(.top, 10)
                                .padding(.bottom, 4)
                            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                                Button { row.choose() } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: row.symbol)
                                            .font(.body.weight(.medium))
                                            .frame(width: 34, height: 34)
                                            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 7))
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(row.title).foregroundStyle(.primary)
                                            Text(row.subtitle).font(.caption).foregroundStyle(Color(.secondaryLabel)).lineLimit(1)
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 5)
                                    .background(index == controller.highlightedSuggestion ? Color(.tertiarySystemFill) : .clear,
                                                in: .rect(cornerRadius: 8))
                                    .padding(.horizontal, 4)
                                    .contentShape(.rect)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(row.title)
                                .accessibilityHint(row.subtitle)
                                .id(index)
                            }
                        }
                        .padding(.bottom, 6)
                    }
                    .hidingScrollEdgeEffects()
                    .frame(maxHeight: 250)
                    .fixedSize(horizontal: false, vertical: true)
                    .onChange(of: controller.highlightedSuggestion) { _, index in proxy.scrollTo(index) }
                }
                .background(.regularMaterial, in: .rect(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color(.separator).opacity(0.5)))
                .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                .padding(.horizontal, 10)
                .padding(.bottom, 6)
            }
        }
    }

    private struct Row: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let symbol: String
        let choose: () -> Void
    }

    private func rows(for context: MarkdownEditing.SuggestionContext) -> [Row] {
        switch context.kind {
        case .command:
            return SlashCommand.matching(context.query).map { command in
                Row(id: command.id, title: command.title, subtitle: command.subtitle, symbol: command.symbol) {
                    controller.chooseCommand(command)
                }
            }
        case .page:
            return PageSuggestions.matching(context.query, in: store.index, excluding: documentPath).map { page in
                Row(id: page.path.string, title: page.path.baseName,
                    subtitle: page.path.parent.isRoot ? "Vault" : page.path.parent.string, symbol: "doc.text") {
                    controller.choosePage(page.path.baseName)
                }
            }
        }
    }
}

/// Formatting controls docked above the keyboard.
private struct FormattingBar: View {
    let controller: EditorController

    var body: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    button("Add block", "plus") { controller.openCommandMenu() }
                    divider
                    Menu {
                        Button("Text", systemImage: "textformat") { controller.setBlockStyle(.paragraph) }
                        Button("Heading 1", systemImage: "textformat.size.larger") { controller.setBlockStyle(.heading(1)) }
                        Button("Heading 2", systemImage: "textformat.size") { controller.setBlockStyle(.heading(2)) }
                        Button("Heading 3", systemImage: "textformat.size.smaller") { controller.setBlockStyle(.heading(3)) }
                        Button("Quote", systemImage: "text.quote") { controller.setBlockStyle(.quote) }
                        Button("Code Block", systemImage: "chevron.left.forwardslash.chevron.right") { controller.insert(.codeBlock) }
                        Button("Divider", systemImage: "minus") { controller.insert(.divider) }
                    } label: {
                        icon("textformat")
                    }
                    .accessibilityLabel("Turn into")
                    button("To-do", "checklist") { controller.setBlockStyle(.todo) }
                    button("Bulleted list", "list.bullet") { controller.setBlockStyle(.bullet) }
                    button("Numbered list", "list.number") { controller.setBlockStyle(.numbered) }
                    divider
                    button("Bold", "bold") { controller.toggleWrap("**") }
                    button("Italic", "italic") { controller.toggleWrap("*") }
                    button("Strikethrough", "strikethrough") { controller.toggleWrap("~~") }
                    button("Inline code", "chevron.left.forwardslash.chevron.right") { controller.toggleWrap("`") }
                    button("Link", "link") { controller.insertLink() }
                    button("Link to page", "doc.badge.plus") { controller.startPageLink() }
                    divider
                    button("Indent", "increase.indent") { controller.indent() }
                    button("Outdent", "decrease.indent") { controller.outdent() }
                    button("Undo", "arrow.uturn.backward") { controller.undo() }
                    button("Redo", "arrow.uturn.forward") { controller.redo() }
                }
                .padding(.horizontal, 6)
            }
            Divider().frame(height: 24)
            button("Hide keyboard", "keyboard.chevron.compact.down") { controller.dismissKeyboard() }
                .padding(.horizontal, 4)
        }
        .frame(height: 46)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }

    private var divider: some View {
        Divider().frame(height: 22).padding(.horizontal, 4)
    }

    private func icon(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 17, weight: .medium))
            .frame(width: 40, height: 40)
            .contentShape(.rect)
    }

    private func button(_ label: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { icon(symbol) }
            .buttonStyle(.plain)
            .foregroundStyle(.primary)
            .accessibilityLabel(label)
    }
}

private extension View {
    /// iOS 26 blurs content at scroll edges; that washes out a menu this small.
    @ViewBuilder
    func hidingScrollEdgeEffects() -> some View {
        if #available(iOS 26.0, *) {
            scrollEdgeEffectHidden(true, for: .all)
        } else {
            self
        }
    }
}
