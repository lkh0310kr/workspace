import Foundation
import Testing
@testable import PKMS

/// Applies an edit to `text`, returning the new text and selection.
private func apply(_ edit: TextEdit, to text: String) -> (String, NSRange) {
    ((text as NSString).replacingCharacters(in: edit.range, with: edit.replacement), edit.selection)
}

private func caret(_ location: Int) -> NSRange { NSRange(location: location, length: 0) }

struct MarkdownEditingTests {
    @Test func blockStylesToggleAndConvert() {
        var (text, sel) = apply(MarkdownEditing.setBlockStyle(.heading(1), in: "Title", selection: caret(5)), to: "Title")
        #expect(text == "# Title" && sel == caret(7))
        (text, sel) = apply(MarkdownEditing.setBlockStyle(.todo, in: text, selection: sel), to: text)
        #expect(text == "- [ ] Title")
        (text, _) = apply(MarkdownEditing.setBlockStyle(.todo, in: text, selection: sel), to: text)
        #expect(text == "Title")
    }

    @Test func numberedListOverSeveralLines() {
        let text = "a\nb\nc"
        let (result, _) = apply(MarkdownEditing.setBlockStyle(.numbered, in: text, selection: NSRange(location: 0, length: 5)), to: text)
        #expect(result == "1. a\n2. b\n3. c")
    }

    @Test func returnContinuesLists() {
        var text = "- [x] done"
        var (result, sel) = apply(MarkdownEditing.returnKey(in: text, selection: caret(10))!, to: text)
        #expect(result == "- [x] done\n- [ ] " && sel == caret(17))

        text = "9. nine"
        (result, _) = apply(MarkdownEditing.returnKey(in: text, selection: caret(7))!, to: text)
        #expect(result == "9. nine\n10. ")

        #expect(MarkdownEditing.returnKey(in: "# Heading", selection: caret(9)) == nil)
        #expect(MarkdownEditing.returnKey(in: "plain", selection: caret(5)) == nil)
    }

    @Test func returnOnEmptyItemEndsOrOutdentsList() {
        var text = "- a\n- "
        var (result, sel) = apply(MarkdownEditing.returnKey(in: text, selection: caret(6))!, to: text)
        #expect(result == "- a\n\n" && sel == caret(5))

        text = "- a\n  - "
        (result, _) = apply(MarkdownEditing.returnKey(in: text, selection: caret(8))!, to: text)
        #expect(result == "- a\n- ")
    }

    @Test func backspaceAtContentStartRemovesMarkerOrOutdents() {
        var (result, sel) = apply(MarkdownEditing.backspaceKey(in: "- [ ] ", selection: caret(6))!, to: "- [ ] ")
        #expect(result == "" && sel == caret(0))

        (result, sel) = apply(MarkdownEditing.backspaceKey(in: "- text", selection: caret(2))!, to: "- text")
        #expect(result == "text" && sel == caret(0))

        (result, sel) = apply(MarkdownEditing.backspaceKey(in: "# Title", selection: caret(2))!, to: "# Title")
        #expect(result == "Title" && sel == caret(0))

        let nested = "- a\n  - "
        (result, sel) = apply(MarkdownEditing.backspaceKey(in: nested, selection: caret(8))!, to: nested)
        #expect(result == "- a\n- " && sel == caret(6))

        // Inside the text, or with a selection, backspace is just backspace.
        #expect(MarkdownEditing.backspaceKey(in: "- text", selection: caret(4)) == nil)
        #expect(MarkdownEditing.backspaceKey(in: "- text", selection: NSRange(location: 2, length: 2)) == nil)
        #expect(MarkdownEditing.backspaceKey(in: "plain", selection: caret(0)) == nil)
    }

    @Test func indentNestsUnderParentItem() {
        let text = "1. a\n1. b"
        let (result, _) = apply(MarkdownEditing.indent(in: text, selection: caret(9)), to: text)
        #expect(result == "1. a\n   1. b")
        let (back, _) = apply(MarkdownEditing.outdent(in: result, selection: caret(12)), to: result)
        #expect(back == text)
    }

    @Test func wrapAndUnwrap() {
        let text = "make this bold"
        let sel = NSRange(location: 10, length: 4)
        let (wrapped, wrappedSel) = apply(MarkdownEditing.toggleWrap("**", in: text, selection: sel), to: text)
        #expect(wrapped == "make this **bold**" && wrappedSel == NSRange(location: 12, length: 4))
        let (unwrapped, _) = apply(MarkdownEditing.toggleWrap("**", in: wrapped, selection: wrappedSel), to: wrapped)
        #expect(unwrapped == text)
        let (empty, emptySel) = apply(MarkdownEditing.toggleWrap("*", in: "", selection: caret(0)), to: "")
        #expect(empty == "**" && emptySel == caret(1))
    }

    @Test func detectsSuggestionTriggers() {
        let slash = MarkdownEditing.suggestionContext(in: "hello\n/hea", selection: caret(10))
        #expect(slash == .init(kind: .command, query: "hea", range: NSRange(location: 6, length: 4)))
        #expect(MarkdownEditing.suggestionContext(in: "and/or", selection: caret(6)) == nil)
        let page = MarkdownEditing.suggestionContext(in: "see [[Proj", selection: caret(10))
        #expect(page == .init(kind: .page, query: "Proj", range: NSRange(location: 4, length: 6)))
        #expect(MarkdownEditing.suggestionContext(in: "see [[Proj]] ", selection: caret(13)) == nil)
    }
}
