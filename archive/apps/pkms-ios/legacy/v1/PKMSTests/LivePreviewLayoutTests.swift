import Testing
import UIKit
@testable import PKMS

/// Lays text out with the live-preview stack (no view) and checks where things end up.
@MainActor
struct LivePreviewLayoutTests {
    let storage = NSTextStorage()
    let layoutManager = LivePreviewLayoutManager()
    let container = NSTextContainer(size: CGSize(width: 360, height: CGFloat.greatestFiniteMagnitude))
    let highlighter = MarkdownHighlighter(widgets: WidgetCache())

    init() {
        layoutManager.addTextContainer(container)
        storage.addLayoutManager(layoutManager)
    }

    private func layout(_ text: String, selection: NSRange? = nil) {
        storage.setAttributedString(NSAttributedString(string: text))
        highlighter.highlight(storage, editedRange: nil, selection: selection, isProcessingEdit: false)
        layoutManager.ensureLayout(for: container)
    }

    private func rect(of substring: String) -> CGRect {
        let range = (storage.string as NSString).range(of: substring)
        let glyphs = layoutManager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
        return layoutManager.boundingRect(forGlyphRange: glyphs, in: container)
    }

    @Test func checkboxSitsAtLineStartAndTextFollowsIt() throws {
        layout("- [ ] Milk\n- [ ] Eggs")
        let milk = rect(of: "Milk")
        let markerRange = (storage.string as NSString).range(of: "- [ ]")
        let gutter = try #require(layoutManager.listGutter(forCharacterRange: markerRange, in: container))
        let box = layoutManager.checkboxFrame(in: gutter)
        #expect(box.minX >= 0 && box.maxX <= milk.minX, "checkbox should sit left of the text, got \(box) vs \(milk)")
        #expect(milk.minX > 20 && milk.minX < 40, "text should follow the checkbox, got \(milk)")
        // Every item lines up, not just the first paragraph of the note.
        #expect(abs(rect(of: "Eggs").minX - milk.minX) < 1)
    }

    /// Bullets, checkboxes and numbers all start their text at the same x, like Notion.
    @Test func allListKindsShareOneTextOffset() {
        layout("- Bullet\n- [ ] Task\n1. First\n10. Tenth\nPlain")
        let bullet = rect(of: "Bullet").minX
        #expect(abs(rect(of: "Task").minX - bullet) < 0.5)
        #expect(abs(rect(of: "First").minX - bullet) < 0.5)
        #expect(abs(rect(of: "Tenth").minX - bullet) < 0.5)
        #expect(abs(bullet - rect(of: "Plain").minX - LivePreviewMetrics.listGutter) < 0.5)
    }

    /// Marks sit on the text, including Hangul, whose body sits lower than a Latin cap-height.
    @Test func listMarksLineUpWithTheText() throws {
        layout("- [ ] 한글\n- 점\n1. 번호")
        let hangul = rect(of: "한글")
        let marker = (storage.string as NSString).range(of: "- [ ]")
        let gutter = try #require(layoutManager.listGutter(forCharacterRange: marker, in: container))
        let box = layoutManager.checkboxFrame(in: gutter)
        #expect(abs(box.midY - hangul.midY) < 1.5, "checkbox \(box.midY) vs text \(hangul.midY)")
        let bullet = (storage.string as NSString).range(of: "- 점")
        let bulletGutter = try #require(layoutManager.listGutter(forCharacterRange: NSRange(location: bullet.location, length: 1), in: container))
        #expect(abs(bulletGutter.markCenterY - rect(of: "점").midY) < 1.5)
        let number = (storage.string as NSString).range(of: "1. ")
        let numberGutter = try #require(layoutManager.listGutter(forCharacterRange: number, in: container))
        let textGlyph = layoutManager.glyphIndexForCharacter(at: (storage.string as NSString).range(of: "번호").location)
        let fragment = layoutManager.lineFragmentRect(forGlyphAt: textGlyph, effectiveRange: nil)
        let baseline = fragment.minY + layoutManager.location(forGlyphAt: textGlyph).y
        #expect(abs(numberGutter.baseline - baseline) < 0.5)
    }

    @Test func nestedItemsStepInByOneGutter() {
        layout("- Parent\n  - Child\n    - [ ] Grandchild")
        let parent = rect(of: "Parent").minX
        #expect(abs(rect(of: "Child").minX - parent - LivePreviewMetrics.listGutter) < 0.5)
        #expect(abs(rect(of: "Grandchild").minX - parent - 2 * LivePreviewMetrics.listGutter) < 0.5)
    }

    /// With the cursor inside the marker the raw Markdown shows; at the text start it is rendered.
    @Test func markerRevealsOnlyWhileCursorIsInsideIt() {
        layout("- [ ] Milk", selection: NSRange(location: 6, length: 0))
        #expect(storage.attribute(.mdCollapsed, at: 0, effectiveRange: nil) != nil)
        layout("- [ ] Milk", selection: NSRange(location: 3, length: 0))
        #expect(storage.attribute(.mdCollapsed, at: 0, effectiveRange: nil) == nil)
    }

    @Test func wrappedTaskLinesAlignWithText() {
        layout("Intro\n- [ ] " + String(repeating: "word ", count: 30))
        let range = (storage.string as NSString).range(of: "word")
        let firstLine = layoutManager.lineFragmentUsedRect(forGlyphAt: layoutManager.glyphIndexForCharacter(at: range.location), effectiveRange: nil)
        let last = layoutManager.glyphIndexForCharacter(at: storage.length - 2)
        let lastLineText = layoutManager.boundingRect(forGlyphRange: NSRange(location: layoutManager.glyphRange(forBoundingRect: layoutManager.lineFragmentRect(forGlyphAt: last, effectiveRange: nil), in: container).location, length: 1), in: container)
        #expect(lastLineText.minX > 20, "wrapped lines should hang under the text, got \(lastLineText)")
        #expect(firstLine.minY < lastLineText.minY)
    }

    @Test func renderedTableIsFullHeight() throws {
        let table = try #require(MarkdownParser.parse("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |").blocks.first.flatMap {
            if case .table(let table) = $0 { table } else { nil }
        })
        let image = try #require(WidgetCache().table(table, key: "t", dark: false))
        #expect(image.size.height > 4 * 30, "all four rows should be rendered, got \(image.size)")
    }

    @Test func tableReservesItsHeight() {
        let source = "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |"
        layout("Intro\n" + source + "\nAfter")
        let intro = rect(of: "Intro")
        let after = rect(of: "After")
        var decoration: MarkdownDecoration?
        storage.enumerateAttribute(.mdDecoration, in: NSRange(location: 0, length: storage.length)) { value, _, _ in
            if let d = value as? MarkdownDecoration, d.isWidget { decoration = d }
        }
        guard case .widget(_, let size)? = decoration?.kind else {
            Issue.record("table should render as a widget")
            return
        }
        #expect(after.minY - intro.maxY >= size.height, "text after the table should start below it")
    }

    @Test func boldItalicHidesAllMarkers() {
        layout("x ***both*** y")
        #expect(rect(of: "both").minX - rect(of: "x").maxX < 12)
    }

    @Test func hiddenHeadingMarkerTakesNoSpace() {
        layout("# Title")
        #expect(rect(of: "Title").minX < 8)
    }

    /// A heading marker has to stay on the same line as its title. Null glyphs glue `#` onto the
    /// previous line and wrap the title under it, so the caret shows up a row too low.
    @Test func headingMarkerStaysOnTheTitleLine() {
        layout("Hello\n# Title\n## Section")
        let title = rect(of: "Title")
        let section = rect(of: "Section")
        #expect(abs(fragmentMinY(of: "#") - title.minY) < 1, "hash and title split")
        #expect(abs(fragmentMinY(of: "##") - section.minY) < 1, "section marker split from its text")
        #expect(section.minY > title.maxY - 1)
    }

    @Test func focusingAHeadingDoesNotShiftItsText() {
        let text = "# Title\nBody"
        layout(text)
        let titleY = rect(of: "Title").minY
        let bodyY = rect(of: "Body").minY
        layout(text, selection: NSRange(location: (text as NSString).range(of: "Title").location, length: 0))
        #expect(abs(rect(of: "Title").minY - titleY) < 1, "title shifted \(titleY) -> \(rect(of: "Title").minY)")
        #expect(abs(rect(of: "Body").minY - bodyY) < 1, "body shifted \(bodyY) -> \(rect(of: "Body").minY)")
    }

    @Test func listMarkerStaysOnTheItemLine() {
        layout("Hello\n- Milk\n1. Eggs")
        #expect(abs(fragmentMinY(of: "-") - rect(of: "Milk").minY) < 1)
        #expect(abs(fragmentMinY(of: "1.") - rect(of: "Eggs").minY) < 1)
    }

    @Test func quoteAndBoldMarkersStayOnTheirLine() {
        layout("Hello\n> Quote\n**Bold**")
        #expect(abs(fragmentMinY(of: ">") - rect(of: "Quote").minY) < 1)
        #expect(abs(fragmentMinY(of: "**") - rect(of: "Bold").minY) < 1)
    }

    /// A tap on rendered text must land in that line, not the one below it.
    @Test func tapOnRenderedLineSelectsThatLine() {
        let text = "Hello\n# Title\nBody"
        layout(text)
        let textView = UITextView(frame: CGRect(x: 0, y: 0, width: 390, height: 800), textContainer: container)
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 16, bottom: 160, right: 16)
        let title = rect(of: "Title")
        let point = CGPoint(x: title.midX + 16, y: title.midY + 12)
        guard let position = textView.closestPosition(to: point) else {
            Issue.record("no position for tap at \(point)")
            return
        }
        let index = textView.offset(from: textView.beginningOfDocument, to: position)
        let paragraph = (text as NSString).substring(with: (text as NSString).paragraphRange(for: NSRange(location: index, length: 0)))
        #expect(paragraph.contains("Title"), "tapped title row but got '\(paragraph)' at \(index)")
    }

    @Test func focusingAHeadingDoesNotPushTheLineDown() {
        let text = "# Title\n## Section\nBody"
        layout(text)
        let renderedSection = rect(of: "Section").minY
        let renderedBody = rect(of: "Body").minY
        let section = (text as NSString).range(of: "Section")
        layout(text, selection: NSRange(location: section.location, length: 0))
        #expect(abs(rect(of: "Section").minY - renderedSection) < 1, "section moved \(renderedSection) -> \(rect(of: "Section").minY)")
        #expect(abs(rect(of: "Body").minY - renderedBody) < 1, "body moved \(renderedBody) -> \(rect(of: "Body").minY)")
        #expect(abs(fragmentMinY(of: "##") - rect(of: "Section").minY) < 1)
    }

    private func fragmentMinY(of substring: String) -> CGFloat {
        let range = (storage.string as NSString).range(of: substring)
        let glyph = layoutManager.glyphIndexForCharacter(at: range.location)
        return layoutManager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil).minY
    }

    /// Pressing return on a task must keep the previous item's text laid out, not only the new line.
    @Test func returnOnTaskKeepsPreviousLineVisible() {
        let original = "- [ ] Milk"
        storage.setAttributedString(NSAttributedString(string: original))
        let caret = NSRange(location: (original as NSString).length, length: 0)
        highlighter.highlight(storage, editedRange: nil, selection: caret, isProcessingEdit: false)
        layoutManager.ensureLayout(for: container)

        let edit = MarkdownEditing.returnKey(in: storage.string, selection: caret)!
        storage.replaceCharacters(in: edit.range, with: edit.replacement)
        let edited = NSRange(location: edit.range.location, length: (edit.replacement as NSString).length)
        highlighter.highlight(storage, editedRange: edited, selection: edit.selection, isProcessingEdit: true)
        layoutManager.ensureLayout(for: container)

        let milk = rect(of: "Milk")
        #expect(milk.width > 10 && milk.height > 4, "previous task text should stay visible, got \(milk)")
        let hidden = storage.attribute(.mdHidden, at: (storage.string as NSString).range(of: "Milk").location, effectiveRange: nil) != nil
        #expect(!hidden)
    }
}
