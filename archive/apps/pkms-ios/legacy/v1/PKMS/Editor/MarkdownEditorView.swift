import SwiftUI
import UIKit

/// Commands and state shared between the text view and the SwiftUI chrome around it
/// (formatting bar, "/" menu, page-link suggestions).
@MainActor
@Observable
final class EditorController {
    @ObservationIgnored fileprivate weak var textView: EditorTextView?
    @ObservationIgnored fileprivate var onTextChange: (String) -> Void = { _ in }
    /// Opens a tapped link target (URL, relative path or `pkms-wiki:` target).
    @ObservationIgnored var onOpenLink: (String) -> Void = { _ in }
    /// Called when the keyboard goes away.
    @ObservationIgnored var onEndEditing: () -> Void = {}

    private(set) var suggestion: MarkdownEditing.SuggestionContext?
    private(set) var isFocused = false
    /// Index of the highlighted suggestion; return picks it.
    var highlightedSuggestion = 0

    var text: String { textView?.text ?? "" }

    func focus(atEnd: Bool = false) {
        guard let textView else { return }
        if atEnd { textView.selectedRange = NSRange(location: (textView.text as NSString).length, length: 0) }
        textView.becomeFirstResponder()
    }

    func dismissKeyboard() { textView?.resignFirstResponder() }
    func undo() { textView?.undoManager?.undo() }
    func redo() { textView?.undoManager?.redo() }
    var canUndo: Bool { textView?.undoManager?.canUndo ?? false }

    func setBlockStyle(_ style: BlockStyle) {
        apply { MarkdownEditing.setBlockStyle(style, in: $0, selection: $1) }
    }

    func insert(_ block: BlockInsertion) {
        apply { MarkdownEditing.insert(block, in: $0, selection: $1) }
    }

    func toggleWrap(_ marker: String) {
        apply { MarkdownEditing.toggleWrap(marker, in: $0, selection: $1) }
    }

    func insertLink() {
        apply { MarkdownEditing.insertLink(in: $0, selection: $1) }
    }

    /// Starts a `[[` page link at the cursor, which opens page suggestions.
    func startPageLink() {
        apply { _, selection in
            TextEdit(range: selection, replacement: "[[", selection: NSRange(location: selection.location + 2, length: 0))
        }
    }

    /// The "+" button: opens the "/" menu on the current line if it's empty, or on a new line below.
    func openCommandMenu() {
        if !(textView?.isFirstResponder ?? false) { focus() }
        apply { text, selection in
            let ns = text as NSString
            let line = MarkdownEditing.lineRange(in: ns, for: selection)
            let isEmpty = ns.substring(with: line).trimmingCharacters(in: .whitespaces).isEmpty
            let insertion = isEmpty ? "/" : "\n/"
            let at = isEmpty ? NSRange(location: line.location, length: line.length) : NSRange(location: line.location + line.length, length: 0)
            return TextEdit(range: at, replacement: insertion,
                            selection: NSRange(location: at.location + insertion.utf16.count, length: 0))
        }
    }

    /// Replaces the whole text (e.g. after merging a change from sync), keeping the cursor nearby.
    func replaceAllText(with newText: String) {
        guard let textView else { return }
        let caret = min(textView.selectedRange.location, (newText as NSString).length)
        replace(TextEdit(range: NSRange(location: 0, length: (textView.text as NSString).length),
                         replacement: newText, selection: NSRange(location: caret, length: 0)))
    }

    func moveSuggestionHighlight(by delta: Int) {
        highlightedSuggestion = max(0, highlightedSuggestion + delta)
    }

    func indent() { apply { MarkdownEditing.indent(in: $0, selection: $1) } }
    func outdent() { apply { MarkdownEditing.outdent(in: $0, selection: $1) } }

    /// Replaces the "/query" trigger with the chosen block style.
    func chooseCommand(_ command: SlashCommand) {
        guard let context = suggestion, context.kind == .command else { return }
        replace(TextEdit(range: context.range, replacement: "",
                         selection: NSRange(location: context.range.location, length: 0)))
        switch command.action {
        case .style(let style): setBlockStyle(style)
        case .insert(let block): insert(block)
        }
    }

    /// Completes a `[[query` trigger with a page name.
    func choosePage(_ name: String) {
        guard let context = suggestion, context.kind == .page else { return }
        let replacement = "[[\(name)]]"
        replace(TextEdit(range: context.range, replacement: replacement,
                         selection: NSRange(location: context.range.location + replacement.utf16.count, length: 0)))
    }

    func cancelSuggestion() { suggestion = nil }

    // MARK: - Internals

    private func apply(_ makeEdit: (String, NSRange) -> TextEdit) {
        guard let textView else { return }
        replace(makeEdit(textView.text, textView.selectedRange))
    }

    /// Applies an edit through `UITextInput` so it participates in undo.
    fileprivate func replace(_ edit: TextEdit) {
        guard let textView,
              let start = textView.position(from: textView.beginningOfDocument, offset: edit.range.location),
              let end = textView.position(from: start, offset: edit.range.length),
              let range = textView.textRange(from: start, to: end) else { return }
        textView.replace(range, withText: edit.replacement)
        textView.selectedRange = edit.selection
        textDidChange()
    }

    fileprivate func textDidChange() {
        guard let textView else { return }
        onTextChange(textView.text)
        updateSuggestion()
    }

    fileprivate func updateSuggestion() {
        guard let textView else { return }
        let context = textView.isFirstResponder
            ? MarkdownEditing.suggestionContext(in: textView.text, selection: textView.selectedRange)
            : nil
        if context?.kind != suggestion?.kind || context?.query != suggestion?.query { highlightedSuggestion = 0 }
        suggestion = context
    }

    fileprivate func setFocused(_ focused: Bool) {
        isFocused = focused
        updateSuggestion()
        if !focused { onEndEditing() }
    }

    /// Checks or unchecks the task whose `- [ ]` marker spans `marker`, without moving the cursor.
    fileprivate func toggleCheckbox(marker: NSRange) {
        guard let textView else { return }
        let bracket = (textView.text as NSString).range(of: "[", range: marker)
        guard bracket.location != NSNotFound, NSMaxRange(bracket) < NSMaxRange(marker) else { return }
        let inner = NSRange(location: bracket.location + 1, length: 1)
        let checked = (textView.text as NSString).substring(with: inner) != " "
        replace(TextEdit(range: inner, replacement: checked ? " " : "x", selection: textView.selectedRange))
    }

    /// Called for return while a suggestion list is showing. Returns true if it handled the key.
    @ObservationIgnored var onSuggestionReturn: () -> Bool = { false }
}

/// An entry in the "/" menu.
struct SlashCommand: Identifiable {
    enum Action {
        case style(BlockStyle)
        case insert(BlockInsertion)
    }

    let id: String
    let title: String
    let subtitle: String
    let symbol: String
    let keywords: [String]
    let action: Action

    static let all: [SlashCommand] = [
        SlashCommand(id: "text", title: "Text", subtitle: "Plain paragraph", symbol: "textformat", keywords: ["paragraph", "plain", "본문", "텍스트"], action: .style(.paragraph)),
        SlashCommand(id: "h1", title: "Heading 1", subtitle: "Big section heading", symbol: "number", keywords: ["title", "h1", "제목"], action: .style(.heading(1))),
        SlashCommand(id: "h2", title: "Heading 2", subtitle: "Medium section heading", symbol: "number", keywords: ["h2", "제목"], action: .style(.heading(2))),
        SlashCommand(id: "h3", title: "Heading 3", subtitle: "Small section heading", symbol: "number", keywords: ["h3", "제목"], action: .style(.heading(3))),
        SlashCommand(id: "todo", title: "To-do List", subtitle: "Track tasks with checkboxes", symbol: "checklist", keywords: ["task", "check", "checkbox", "할일", "체크"], action: .style(.todo)),
        SlashCommand(id: "bullet", title: "Bulleted List", subtitle: "Simple bulleted list", symbol: "list.bullet", keywords: ["unordered", "ul", "목록"], action: .style(.bullet)),
        SlashCommand(id: "numbered", title: "Numbered List", subtitle: "List with numbering", symbol: "list.number", keywords: ["ordered", "ol", "번호"], action: .style(.numbered)),
        SlashCommand(id: "quote", title: "Quote", subtitle: "Capture a quote", symbol: "text.quote", keywords: ["blockquote", "인용"], action: .style(.quote)),
        SlashCommand(id: "code", title: "Code", subtitle: "Code block", symbol: "chevron.left.forwardslash.chevron.right", keywords: ["snippet", "코드"], action: .insert(.codeBlock)),
        SlashCommand(id: "divider", title: "Divider", subtitle: "Visually divide blocks", symbol: "minus", keywords: ["line", "hr", "rule", "구분선"], action: .insert(.divider)),
    ]

    static func matching(_ query: String) -> [SlashCommand] {
        guard !query.isEmpty else { return all }
        let q = query.lowercased()
        return all.filter { command in
            command.title.lowercased().contains(q) || command.id.hasPrefix(q) || command.keywords.contains { $0.hasPrefix(q) }
        }
    }
}

/// Hosts the live-preview text view: always editable, rendered wherever the cursor isn't.
struct MarkdownEditorView: UIViewRepresentable {
    let initialText: String
    let controller: EditorController
    let widgets: WidgetCache
    let onChange: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(controller: controller, widgets: widgets) }

    func makeUIView(context: Context) -> EditorTextView {
        // TextKit 1, so the layout manager can hide syntax glyphs and draw decorations.
        let storage = NSTextStorage()
        let layoutManager = LivePreviewLayoutManager()
        layoutManager.widgets = widgets
        let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = true
        layoutManager.addTextContainer(container)
        storage.addLayoutManager(layoutManager)

        let textView = EditorTextView(frame: .zero, textContainer: container)
        let coordinator = context.coordinator
        textView.editor = controller
        textView.delegate = coordinator
        storage.delegate = coordinator
        textView.backgroundColor = .clear
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 16, bottom: 160, right: 16)
        textView.alwaysBounceVertical = true
        textView.keyboardDismissMode = .interactive
        textView.adjustsFontForContentSizeCategory = true
        textView.smartDashesType = .no
        textView.smartQuotesType = .no
        textView.smartInsertDeleteType = .no
        textView.typingAttributes = coordinator.highlighter.baseAttributes
        textView.text = initialText
        textView.onWidthChange = { [weak textView] width in
            guard let textView else { return }
            coordinator.highlighter.contentWidth = width
            coordinator.restyleAll(textView)
        }
        coordinator.installTapHandling(on: textView)
        widgets.onChange = { [weak textView] in
            if let textView { coordinator.restyleAll(textView) }
        }
        controller.textView = textView
        controller.onTextChange = onChange
        coordinator.restyleAll(textView)
        return textView
    }

    func updateUIView(_ textView: EditorTextView, context: Context) {
        controller.onTextChange = onChange
    }

    final class Coordinator: NSObject, UITextViewDelegate, @preconcurrency NSTextStorageDelegate, UIGestureRecognizerDelegate {
        let controller: EditorController
        let highlighter: MarkdownHighlighter
        /// Selection used for the last styling pass (nil = not editing, everything rendered).
        private var styledSelection: NSRange?
        private var pendingTap: (() -> Void)?
        /// Lines whose glyphs must be rebuilt after the current edit. TextKit ignores custom
        /// hide-attributes changed inside `didProcessEditing`, so the line stays blank until
        /// something else (selecting it again) forces a new layout.
        private var pendingLayoutRange: NSRange?
        private var layoutRefreshScheduled = false

        init(controller: EditorController, widgets: WidgetCache) {
            self.controller = controller
            self.highlighter = MarkdownHighlighter(widgets: widgets)
        }

        private func activeSelection(_ textView: UITextView) -> NSRange? {
            textView.isFirstResponder ? textView.selectedRange : nil
        }

        func restyleAll(_ textView: UITextView) {
            styledSelection = activeSelection(textView)
            highlighter.highlight(textView.textStorage, editedRange: nil, selection: styledSelection, isProcessingEdit: false)
        }

        func textStorage(_ storage: NSTextStorage, didProcessEditing editedMask: NSTextStorage.EditActions,
                         range editedRange: NSRange, changeInLength delta: Int) {
            guard editedMask.contains(.editedCharacters), let textView = controller.textView else { return }
            // The documented place to adjust attributes (not characters) of the edit being processed.
            // The cursor sits at the end of the edit, so that line is styled as the one being edited.
            let caret = NSRange(location: min(NSMaxRange(editedRange), storage.length), length: 0)
            let selection: NSRange? = textView.isFirstResponder ? caret : nil
            styledSelection = selection
            let styled = highlighter.highlight(storage, editedRange: editedRange, selection: selection, isProcessingEdit: true)
            scheduleLayoutRefresh(textView, range: styled)
        }

        func textViewDidChange(_ textView: UITextView) {
            controller.textDidChange()
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            textView.typingAttributes = highlighter.baseAttributes
            let selection = activeSelection(textView)
            if !sameLines(selection, styledSelection, in: textView.text as NSString) {
                let styled = highlighter.selectionChanged(textView.textStorage, from: styledSelection, to: selection)
                scheduleLayoutRefresh(textView, range: styled)
            }
            styledSelection = selection
            textView.layoutIfNeeded()
            textView.scrollRangeToVisible(textView.selectedRange)
            controller.updateSuggestion()
        }

        /// Rebuilds glyphs for `range` on the next turn, after TextKit has finished the edit.
        /// Hidden syntax is a custom attribute, so the line otherwise keeps its old (blank) glyphs
        /// until the cursor comes back and the paragraph is laid out again.
        private func scheduleLayoutRefresh(_ textView: UITextView, range: NSRange) {
            guard range.length > 0 else { return }
            let full = NSRange(location: 0, length: textView.textStorage.length)
            let clamped = NSIntersectionRange(range, full)
            guard clamped.length > 0 else { return }
            pendingLayoutRange = pendingLayoutRange.map { NSUnionRange($0, clamped) } ?? clamped
            guard !layoutRefreshScheduled else { return }
            layoutRefreshScheduled = true
            DispatchQueue.main.async { [weak self, weak textView] in
                guard let self, let textView else { return }
                self.layoutRefreshScheduled = false
                // Let an in-progress composition finish; its commit schedules another refresh.
                guard textView.markedTextRange == nil else { return }
                let length = textView.textStorage.length
                let pending = self.pendingLayoutRange ?? NSRange(location: 0, length: length)
                self.pendingLayoutRange = nil
                let safe = NSIntersectionRange(pending, NSRange(location: 0, length: length))
                guard safe.length > 0 else { return }
                let selection = self.activeSelection(textView)
                let styled = self.highlighter.highlight(textView.textStorage, editedRange: safe, selection: selection, isProcessingEdit: false)
                self.styledSelection = selection
                guard styled.length > 0 else { return }
                let layout = textView.layoutManager
                layout.invalidateGlyphs(forCharacterRange: styled, changeInLength: 0, actualCharacterRange: nil)
                layout.invalidateLayout(forCharacterRange: styled, actualCharacterRange: nil)
                layout.ensureLayout(forCharacterRange: styled)
                layout.invalidateDisplay(forCharacterRange: styled)
            }
        }

        /// Whether two selections cover the same lines, so no restyle is needed.
        private func sameLines(_ a: NSRange?, _ b: NSRange?, in text: NSString) -> Bool {
            guard let a, let b else { return a == nil && b == nil }
            guard NSMaxRange(a) <= text.length, NSMaxRange(b) <= text.length else { return false }
            guard text.paragraphRange(for: a) == text.paragraphRange(for: b) else { return false }
            // List markers reveal only while the cursor is inside them, so moving within such a line restyles it.
            return !lineHasMarker(a, in: text)
        }

        private func lineHasMarker(_ r: NSRange, in text: NSString) -> Bool {
            let line = text.substring(with: text.paragraphRange(for: r))
            return !MarkdownEditing.prefix(of: line).marker.isEmpty
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            textViewDidChangeSelection(textView)
            controller.setFocused(true)
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            textViewDidChangeSelection(textView)
            controller.setFocused(false)
        }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            if text.isEmpty {
                // Backspace with no selection deletes the character before the caret.
                let caret = textView.selectedRange
                guard range.length == 1, caret.length == 0, NSMaxRange(range) == caret.location,
                      textView.markedTextRange == nil,
                      let edit = MarkdownEditing.backspaceKey(in: textView.text, selection: caret) else { return true }
                controller.replace(edit)
                return false
            }
            guard text == "\n" else { return true }
            if controller.suggestion != nil, controller.onSuggestionReturn() { return false }
            if let edit = MarkdownEditing.returnKey(in: textView.text, selection: range) {
                controller.replace(edit)
                return false
            }
            return true
        }

        // MARK: Taps on rendered content

        func installTapHandling(on textView: UITextView) {
            let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
            tap.delegate = self
            textView.addGestureRecognizer(tap)
        }

        @objc private func handleTap() {
            pendingTap?()
            pendingTap = nil
        }

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let textView = recognizer.view as? UITextView else { return false }
            pendingTap = action(at: recognizer.location(in: textView), in: textView)
            return pendingTap != nil
        }

        /// Let our tap decide first; the text view's own taps (placing the cursor) wait for it to fail.
        func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other.view === recognizer.view && other is UITapGestureRecognizer
        }

        private func action(at point: CGPoint, in textView: UITextView) -> (() -> Void)? {
            let layoutManager = textView.layoutManager
            let container = textView.textContainer
            let storage = textView.textStorage
            guard storage.length > 0 else { return nil }
            let p = CGPoint(x: point.x - textView.textContainerInset.left, y: point.y - textView.textContainerInset.top)
            let glyph = layoutManager.glyphIndex(for: p, in: container)
            let index = layoutManager.characterIndexForGlyph(at: glyph)
            guard index < storage.length else { return nil }
            let lineRect = layoutManager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
            guard lineRect.contains(p) else { return nil }

            // Images and tables: tap to edit their source.
            var widgetRange = NSRange()
            if let decoration = storage.attribute(.mdDecoration, at: index, effectiveRange: &widgetRange) as? MarkdownDecoration,
               decoration.isWidget {
                return { [weak textView] in
                    textView?.becomeFirstResponder()
                    textView?.selectedRange = NSRange(location: widgetRange.location, length: 0)
                }
            }

            // Checkboxes: generous hit area around the drawn box.
            let lineGlyphs = layoutManager.glyphRange(forBoundingRect: lineRect, in: container)
            var lineChars = layoutManager.characterRange(forGlyphRange: lineGlyphs, actualGlyphRange: nil)
            // The hidden marker sits at the paragraph start; include it when this is the item's first line.
            let paragraph = (storage.string as NSString).paragraphRange(for: NSRange(location: index, length: 0))
            let firstGlyph = layoutManager.glyphIndexForCharacter(at: paragraph.location)
            if firstGlyph < layoutManager.numberOfGlyphs,
               layoutManager.lineFragmentRect(forGlyphAt: firstGlyph, effectiveRange: nil) == lineRect {
                lineChars = NSUnionRange(lineChars, NSRange(location: paragraph.location, length: 0))
            }
            var found: (() -> Void)?
            storage.enumerateAttribute(.mdDecoration, in: lineChars) { value, range, stop in
                guard let decoration = value as? MarkdownDecoration, case .checkbox = decoration.kind,
                      let preview = layoutManager as? LivePreviewLayoutManager,
                      let gutter = preview.listGutter(forCharacterRange: range, in: container) else { return }
                let box = preview.checkboxFrame(in: gutter).insetBy(dx: -10, dy: -8)
                if box.contains(p) {
                    found = { [weak self] in self?.controller.toggleCheckbox(marker: range) }
                    stop.pointee = true
                }
            }
            if let found { return found }

            // Links open when their line isn't being edited.
            let glyphRect = layoutManager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
            if glyphRect.insetBy(dx: -4, dy: -4).contains(p),
               let target = storage.attribute(.mdLink, at: index, effectiveRange: nil) as? String,
               storage.attribute(.mdHidden, at: index, effectiveRange: nil) == nil {
                let editingThisLine = textView.isFirstResponder
                    && NSLocationInRange(textView.selectedRange.location, (textView.text as NSString).paragraphRange(for: NSRange(location: index, length: 0)))
                if !editingThisLine {
                    return { [weak self] in self?.controller.onOpenLink(target) }
                }
            }
            return nil
        }
    }
}

/// Adds hardware-keyboard shortcuts (⌘B, ⌘I, ⌘K, tab to indent) on iPad.
final class EditorTextView: UITextView {
    weak var editor: EditorController?
    /// Reports the width available for images and tables whenever it changes.
    var onWidthChange: (CGFloat) -> Void = { _ in }
    private var lastWidth: CGFloat = 0

    // The system keyboard otherwise turns `---` into —, quotes into curly quotes, and so on.
    // Those substitutions make a note look edited on another device the next time it syncs.
    override var smartDashesType: UITextSmartDashesType {
        get { .no }
        set { super.smartDashesType = .no }
    }

    override var smartQuotesType: UITextSmartQuotesType {
        get { .no }
        set { super.smartQuotesType = .no }
    }

    override var smartInsertDeleteType: UITextSmartInsertDeleteType {
        get { .no }
        set { super.smartInsertDeleteType = .no }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width - textContainerInset.left - textContainerInset.right - 2 * textContainer.lineFragmentPadding
        if width > 0, abs(width - lastWidth) > 0.5 {
            lastWidth = width
            onWidthChange(width)
        }
    }

    override var keyCommands: [UIKeyCommand]? {
        var commands: [UIKeyCommand] = []
        if editor?.suggestion != nil {
            for (input, action) in [(UIKeyCommand.inputUpArrow, #selector(suggestionUp)), (UIKeyCommand.inputDownArrow, #selector(suggestionDown))] {
                let command = UIKeyCommand(input: input, modifierFlags: [], action: action)
                command.wantsPriorityOverSystemBehavior = true
                commands.append(command)
            }
        }
        return commands + [
            UIKeyCommand(title: "Bold", action: #selector(bold), input: "b", modifierFlags: .command),
            UIKeyCommand(title: "Italic", action: #selector(italic), input: "i", modifierFlags: .command),
            UIKeyCommand(title: "Link", action: #selector(link), input: "k", modifierFlags: .command),
            UIKeyCommand(title: "Strikethrough", action: #selector(strike), input: "x", modifierFlags: [.command, .shift]),
            UIKeyCommand(title: "To-do", action: #selector(todo), input: "l", modifierFlags: .command),
            UIKeyCommand(input: "\t", modifierFlags: [], action: #selector(indentLine)),
            UIKeyCommand(input: "\t", modifierFlags: .shift, action: #selector(outdentLine)),
            UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape)),
        ]
    }

    @objc private func suggestionUp() { editor?.moveSuggestionHighlight(by: -1) }
    @objc private func suggestionDown() { editor?.moveSuggestionHighlight(by: 1) }
    @objc private func bold() { editor?.toggleWrap("**") }
    @objc private func italic() { editor?.toggleWrap("*") }
    @objc private func link() { editor?.insertLink() }
    @objc private func strike() { editor?.toggleWrap("~~") }
    @objc private func todo() { editor?.setBlockStyle(.todo) }
    @objc private func indentLine() { editor?.indent() }
    @objc private func outdentLine() { editor?.outdent() }
    @objc private func escape() {
        if editor?.suggestion != nil { editor?.cancelSuggestion() } else { resignFirstResponder() }
    }
}
