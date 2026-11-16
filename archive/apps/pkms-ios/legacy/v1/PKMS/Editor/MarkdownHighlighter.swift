import UIKit

/// Styles Markdown source in place for live preview. The line being edited shows its syntax
/// (dimmed); every other line hides it and is rendered: headings, emphasis, checkboxes, bullets,
/// links, rules, images and tables. With no selection (keyboard down) the whole note reads as a
/// rendered page. The text itself is never changed, so the file stays plain Markdown.
@MainActor
final class MarkdownHighlighter {
    let widgets: WidgetCache
    /// Width available for images and tables.
    var contentWidth: CGFloat = 340

    init(widgets: WidgetCache) {
        self.widgets = widgets
    }

    private let body = UIFont.preferredFont(forTextStyle: .body)
    private lazy var mono = UIFontMetrics(forTextStyle: .body).scaledFont(for: .monospacedSystemFont(ofSize: 15, weight: .regular))
    private lazy var smallMono = UIFontMetrics(forTextStyle: .footnote).scaledFont(for: .monospacedSystemFont(ofSize: 13, weight: .regular))

    private func paragraph(indent: CGFloat = 0, head: CGFloat? = nil, minHeight: CGFloat = 0, maxHeight: CGFloat = 0,
                           spacing: CGFloat = 6) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 3
        style.paragraphSpacing = spacing
        style.firstLineHeadIndent = indent
        style.headIndent = head ?? indent
        style.minimumLineHeight = minHeight
        style.maximumLineHeight = maxHeight
        return style
    }

    var baseAttributes: [NSAttributedString.Key: Any] {
        [.font: body, .foregroundColor: UIColor.label, .paragraphStyle: paragraph()]
    }

    private static func regex(_ pattern: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
    }

    private let fence = regex(#"^[ \t]*(```|~~~).*$"#)
    private let tableSeparator = regex(#"^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$"#)
    private let heading = regex(#"^(#{1,6}[ \t]+)(.*)$"#)
    private let quote = regex(#"^([ \t]*>[ \t]?)"#)
    private let task = regex(#"^([ \t]*)([-*+] )(\[([ xX])\])( )"#)
    private let bullet = regex(#"^([ \t]*)([-*+])( )"#)
    private let ordered = regex(#"^([ \t]*)(\d{1,9}[.)] )"#)
    private let rule = regex(#"^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$"#)
    private let boldItalic = regex(#"(\*\*\*|___)(?=\S)(.+?)(?<=\S)\1"#)
    private let bold = regex(#"(\*\*|__)(?=\S)(.+?)(?<=\S)\1"#)
    private let italic = regex(#"(?<![*_\w])([*_])(?=\S)([^*_\n]+?)(?<=\S)\1(?![*_\w])"#)
    private let strike = regex(#"(~~)(?=\S)(.+?)(?<=\S)~~"#)
    private let code = regex(#"(`+)([^`\n]+?)\1"#)
    private let link = regex(#"(?<!!)(\[)([^\]\n]+)(\]\(([^)\n]*)\))"#)
    private let wikiLink = regex(#"(!?\[\[)(?:([^\]|\n]+)\|)?([^\]\n]+)(\]\])"#)
    private let bareURL = regex(#"https?://[^\s<>()\]]+"#)

    // MARK: - Styling

    /// Restyles the lines around `editedRange` (or everything). `selection` is nil when the editor
    /// isn't focused, which renders every line. Returns the character range that was restyled.
    @discardableResult
    func highlight(_ storage: NSTextStorage, editedRange: NSRange?, selection: NSRange?, isProcessingEdit: Bool) -> NSRange {
        let text = storage.string as NSString
        let full = NSRange(location: 0, length: text.length)
        let blocks = blockRanges(in: text)
        var range = full
        if var editedRange {
            // A newline belongs to the previous paragraph. Step back so that line is restyled too,
            // not only the line the cursor landed on.
            if editedRange.location > 0 {
                editedRange.location -= 1
                editedRange.length += 1
            }
            let next = NSMaxRange(editedRange)
            if next < text.length { editedRange.length += 1 }
            range = text.paragraphRange(for: NSIntersectionRange(editedRange, full))
            for block in blocks.code + blocks.tables where NSIntersectionRange(block, range).length > 0 || NSLocationInRange(range.location, block) {
                range = NSUnionRange(range, block)
            }
        }
        guard range.length > 0 else { return range }
        if !isProcessingEdit { storage.beginEditing() }
        style(storage, range: range, selection: selection, blocks: blocks)
        if !isProcessingEdit { storage.endEditing() }
        return range
    }

    /// Restyles just the lines the selection moved between. Returns the character range that was restyled.
    @discardableResult
    func selectionChanged(_ storage: NSTextStorage, from old: NSRange?, to new: NSRange?) -> NSRange {
        let text = storage.string as NSString
        let full = NSRange(location: 0, length: text.length)
        var ranges: [NSRange] = []
        for sel in [old, new].compactMap({ $0 }) where NSMaxRange(sel) <= full.length {
            let paragraph = text.paragraphRange(for: sel)
            if !ranges.contains(where: { NSEqualRanges($0, paragraph) }) { ranges.append(paragraph) }
        }
        guard !ranges.isEmpty else { return NSRange(location: 0, length: 0) }
        storage.beginEditing()
        let blocks = blockRanges(in: text)
        var union = NSRange(location: NSNotFound, length: 0)
        for var range in ranges {
            for block in blocks.code + blocks.tables where NSIntersectionRange(block, range).length > 0 {
                range = NSUnionRange(range, block)
            }
            style(storage, range: range, selection: new, blocks: blocks)
            union = union.location == NSNotFound ? range : NSUnionRange(union, range)
        }
        storage.endEditing()
        return union.location == NSNotFound ? NSRange(location: 0, length: 0) : union
    }

    private func style(_ storage: NSTextStorage, range: NSRange, selection: NSRange?, blocks: (code: [NSRange], tables: [NSRange])) {
        let text = storage.string as NSString
        storage.setAttributes(baseAttributes, range: range)

        func touches(_ r: NSRange) -> Bool {
            guard let selection else { return false }
            return NSIntersectionRange(selection, r).length > 0
                || (selection.location >= r.location && selection.location <= NSMaxRange(r))
        }
        /// Syntax: dimmed while its line is edited, hidden otherwise.
        func syntax(_ r: NSRange, active: Bool, line: NSRange, font: UIFont) {
            hideSyntax(storage, range: r, active: active, line: line, font: font, in: text)
        }

        // Front matter: small and quiet.
        if text.hasPrefix("---\n"), let end = frontMatterEnd(in: text), NSIntersectionRange(range, NSRange(location: 0, length: end)).length > 0 {
            storage.addAttributes([.font: smallMono, .foregroundColor: UIColor.secondaryLabel],
                                  range: NSIntersectionRange(range, NSRange(location: 0, length: end)))
        }

        // Code blocks.
        for block in blocks.code where NSIntersectionRange(block, range).length > 0 {
            let active = touches(block)
            storage.addAttributes([.font: mono, .mdDecoration: MarkdownDecoration(.codeBlock)], range: block)
            fence.enumerateMatches(in: storage.string, range: block) { m, _, _ in
                guard let m else { return }
                syntax(m.range, active: active, line: text.paragraphRange(for: m.range), font: mono)
                if !active {
                    // A hidden fence line becomes a little padding inside the block instead of a full blank line.
                    storage.addAttribute(.paragraphStyle, value: self.paragraph(minHeight: 6, maxHeight: 6, spacing: 0),
                                         range: text.paragraphRange(for: m.range))
                }
            }
        }

        // Tables: rendered as a picture unless being edited.
        for block in blocks.tables where NSIntersectionRange(block, range).length > 0 {
            if touches(block) {
                storage.addAttributes([.font: mono, .foregroundColor: UIColor.secondaryLabel], range: block)
            } else if let table = parseTable(text.substring(with: block)) {
                renderWidget(storage, block: block, key: text.substring(with: block)) {
                    widgets.table(table, key: text.substring(with: block), dark: UITraitCollection.current.userInterfaceStyle == .dark)
                        .map { fitted($0.size) }
                }
            }
        }

        let skip = blocks.code + blocks.tables
        text.enumerateSubstrings(in: range, options: [.byParagraphs, .substringNotRequired]) { _, lineRange, _, _ in
            guard !skip.contains(where: { NSIntersectionRange($0, lineRange).length > 0 || NSLocationInRange(lineRange.location, $0) }) else { return }
            self.styleLine(storage, lineRange, active: touches(lineRange), selection: selection, touches: touches)
        }
    }

    private func styleLine(_ storage: NSTextStorage, _ line: NSRange, active: Bool, selection: NSRange?,
                           touches: (NSRange) -> Bool) {
        let string = storage.string
        let text = string as NSString
        func first(_ regex: NSRegularExpression) -> NSTextCheckingResult? { regex.firstMatch(in: string, range: line) }
        func each(_ regex: NSRegularExpression, _ body: (NSTextCheckingResult) -> Void) {
            regex.enumerateMatches(in: string, range: line) { m, _, _ in if let m { body(m) } }
        }
        func width(of r: NSRange, font: UIFont) -> CGFloat {
            (text.substring(with: r) as NSString).size(withAttributes: [.font: font]).width
        }

        // Standalone images.
        if !active, let source = standaloneImageSource(text.substring(with: line)) {
            switch widgets.image(forSource: source) {
            case .failed:
                storage.addAttribute(.foregroundColor, value: UIColor.secondaryLabel, range: line)
            case .loading:
                renderWidget(storage, block: line, key: source) { CGSize(width: contentWidth, height: 120) }
            case .image(let image):
                renderWidget(storage, block: line, key: source) { fitted(image.size) }
            }
            return
        }

        if let m = first(rule) {
            if active {
                storage.addAttribute(.foregroundColor, value: UIColor.tertiaryLabel, range: m.range)
            } else {
                storage.addAttributes([.foregroundColor: UIColor.clear, .mdDecoration: MarkdownDecoration(.rule)], range: m.range)
            }
            return
        }

        if let m = first(heading) {
            let level = m.range(at: 1).length - (text.substring(with: m.range(at: 1)).filter { $0 == " " || $0 == "\t" }.count)
            let font = headingFont(level)
            storage.addAttributes([.font: font, .paragraphStyle: paragraph(spacing: 8)], range: line)
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: font, in: text)
        }

        if let m = first(quote) {
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: body, in: text)
            storage.addAttributes([.foregroundColor: UIColor.secondaryLabel, .paragraphStyle: paragraph(indent: 14),
                                   .mdDecoration: MarkdownDecoration(.quoteBar)], range: line)
        }

        // List items: the raw prefix (indent + marker) is hidden and every kind of item gets the same
        // fixed gutter, so bullets, checkboxes and numbers line up like Notion's. The prefix shows
        // only while the cursor is inside it, which is how you edit the marker itself.
        func listItem(prefixEnd: Int, indent: NSRange, marker: NSRange, decoration: MarkdownDecoration, revealColor: UIColor) {
            let prefixRange = NSRange(location: line.location, length: prefixEnd - line.location)
            let revealed = selection.map { sel in
                NSIntersectionRange(sel, prefixRange).length > 0 || (sel.location >= line.location && sel.location < prefixEnd)
            } ?? false
            if revealed {
                storage.addAttribute(.foregroundColor, value: revealColor, range: marker)
                let hang = width(of: indent, font: body) + width(of: NSRange(location: marker.location, length: prefixEnd - marker.location), font: body)
                storage.addAttribute(.paragraphStyle, value: paragraph(head: hang, spacing: 4), range: line)
            } else {
                collapseHidden(storage, range: prefixRange, font: body, in: text)
                storage.addAttribute(.mdDecoration, value: decoration, range: marker)
                let head = LivePreviewMetrics.nestOffset(forIndent: text.substring(with: indent)) + LivePreviewMetrics.listGutter
                storage.addAttribute(.paragraphStyle, value: paragraph(indent: head, spacing: 4), range: line)
            }
        }

        if let m = first(task) {
            let marker = NSRange(location: m.range(at: 2).location, length: NSMaxRange(m.range(at: 3)) - m.range(at: 2).location)
            let checked = text.substring(with: m.range(at: 4)) != " "
            let contentStart = NSMaxRange(m.range(at: 5))
            listItem(prefixEnd: contentStart, indent: m.range(at: 1), marker: marker,
                     decoration: MarkdownDecoration(.checkbox(checked: checked)), revealColor: .tertiaryLabel)
            if checked, contentStart < NSMaxRange(line) {
                storage.addAttributes([.foregroundColor: UIColor.secondaryLabel, .strikethroughStyle: NSUnderlineStyle.single.rawValue],
                                      range: NSRange(location: contentStart, length: NSMaxRange(line) - contentStart))
            }
        } else if let m = first(bullet) {
            listItem(prefixEnd: NSMaxRange(m.range(at: 3)), indent: m.range(at: 1), marker: m.range(at: 2),
                     decoration: MarkdownDecoration(.bullet), revealColor: .tertiaryLabel)
        } else if let m = first(ordered) {
            let label = text.substring(with: m.range(at: 2)).trimmingCharacters(in: .whitespaces)
            listItem(prefixEnd: NSMaxRange(m.range(at: 2)), indent: m.range(at: 1), marker: m.range(at: 2),
                     decoration: MarkdownDecoration(.number(label)), revealColor: .secondaryLabel)
        }

        // Inline syntax.
        each(code) { m in
            storage.addAttributes([.font: mono, .backgroundColor: UIColor.secondarySystemFill], range: m.range(at: 2))
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: mono, in: text)
            hideSyntax(storage, range: NSRange(location: NSMaxRange(m.range) - m.range(at: 1).length, length: m.range(at: 1).length),
                       active: active, line: line, font: mono, in: text)
        }
        var emphasized: [NSRange] = []
        each(boldItalic) { m in
            emphasized.append(m.range)
            addTraits([.traitBold, .traitItalic], storage, m.range(at: 2))
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: body, in: text)
            hideSyntax(storage, range: NSRange(location: NSMaxRange(m.range) - 3, length: 3), active: active, line: line, font: body, in: text)
        }
        func insideEmphasis(_ r: NSRange) -> Bool { emphasized.contains { NSIntersectionRange($0, r).length > 0 } }
        each(bold) { m in
            guard !insideEmphasis(m.range) else { return }
            addTraits(.traitBold, storage, m.range(at: 2))
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: body, in: text)
            hideSyntax(storage, range: NSRange(location: NSMaxRange(m.range) - m.range(at: 1).length, length: m.range(at: 1).length),
                       active: active, line: line, font: body, in: text)
        }
        each(italic) { m in
            guard !insideEmphasis(m.range) else { return }
            addTraits(.traitItalic, storage, m.range(at: 2))
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: body, in: text)
            hideSyntax(storage, range: NSRange(location: NSMaxRange(m.range) - 1, length: 1), active: active, line: line, font: body, in: text)
        }
        each(strike) { m in
            storage.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: m.range(at: 2))
            hideSyntax(storage, range: NSRange(location: m.range.location, length: 2), active: active, line: line, font: body, in: text)
            hideSyntax(storage, range: NSRange(location: NSMaxRange(m.range) - 2, length: 2), active: active, line: line, font: body, in: text)
        }
        each(link) { m in
            storage.addAttributes([.foregroundColor: UIColor.tintColor, .mdLink: text.substring(with: m.range(at: 4))], range: m.range(at: 2))
            hideSyntax(storage, range: m.range(at: 1), active: active, line: line, font: body, in: text)
            hideSyntax(storage, range: m.range(at: 3), active: active, line: line, font: body, in: text)
        }
        each(wikiLink) { m in
            let target = m.range(at: 2).location != NSNotFound ? text.substring(with: m.range(at: 2)) : text.substring(with: m.range(at: 3))
            storage.addAttributes([.foregroundColor: UIColor.tintColor, .mdLink: WikiLink.url(for: target)], range: m.range(at: 3))
            let opening = m.range(at: 2).location != NSNotFound
                ? NSRange(location: m.range.location, length: m.range(at: 3).location - m.range.location)
                : m.range(at: 1)
            hideSyntax(storage, range: opening, active: active, line: line, font: body, in: text)
            hideSyntax(storage, range: m.range(at: 4), active: active, line: line, font: body, in: text)
        }
        each(bareURL) { m in
            guard storage.attribute(.mdLink, at: m.range.location, effectiveRange: nil) == nil,
                  storage.attribute(.mdHidden, at: m.range.location, effectiveRange: nil) == nil,
                  storage.attribute(.mdCollapsed, at: m.range.location, effectiveRange: nil) == nil else { return }
            storage.addAttributes([.foregroundColor: UIColor.tintColor, .mdLink: text.substring(with: m.range)], range: m.range)
        }
    }

    /// Use the Markdown parser for image targets so paths with spaces, parentheses,
    /// optional titles, and wiki embeds all resolve the same way in every view.
    private func standaloneImageSource(_ sourceLine: String) -> String? {
        guard sourceLine.contains("![") else { return nil }
        let blocks = MarkdownParser.parse(sourceLine).blocks
        guard blocks.count == 1, case .image(let source, _) = blocks[0] else { return nil }
        return source
    }

    // MARK: - Widgets

    /// Scales a picture down (never up) to fit the text width.
    private func fitted(_ size: CGSize) -> CGSize {
        let scale = min(1, contentWidth / max(size.width, 1))
        return CGSize(width: size.width * scale, height: size.height * scale)
    }

    /// Hides a block's text and reserves space for a picture drawn over its first line.
    private func renderWidget(_ storage: NSTextStorage, block: NSRange, key: String, size: () -> CGSize?) {
        guard let size = size() else { return }
        let text = storage.string as NSString
        var first = true
        text.enumerateSubstrings(in: block, options: [.byParagraphs, .substringNotRequired]) { _, line, enclosing, _ in
            // Hide each line's content but keep its line break, so the lines stay separate paragraphs
            // and the first one can reserve the widget's height.
            storage.addAttribute(.mdHidden, value: true, range: line)
            if first {
                storage.addAttribute(.paragraphStyle, value: self.paragraph(minHeight: size.height + 12, maxHeight: size.height + 12, spacing: 4), range: enclosing)
                if line.length > 0 {
                    storage.addAttribute(.mdDecoration, value: MarkdownDecoration(.widget(key: key, size: size)), range: line)
                }
                first = false
            } else {
                storage.addAttribute(.paragraphStyle, value: self.paragraph(minHeight: 0.01, maxHeight: 0.01, spacing: 0), range: enclosing)
            }
        }
    }

    private func parseTable(_ source: String) -> MarkdownTable? {
        for case .table(let table) in MarkdownParser.parse(source).blocks { return table }
        return nil
    }

    // MARK: - Helpers

    /// Fenced code blocks (an unclosed fence runs to the end) and pipe tables.
    private func blockRanges(in text: NSString) -> (code: [NSRange], tables: [NSRange]) {
        var code: [NSRange] = []
        var open: NSRange?
        fence.enumerateMatches(in: text as String, range: NSRange(location: 0, length: text.length)) { match, _, _ in
            guard let match else { return }
            let line = text.paragraphRange(for: match.range)
            if let start = open {
                code.append(NSUnionRange(start, line))
                open = nil
            } else {
                open = line
            }
        }
        if let open { code.append(NSRange(location: open.location, length: text.length - open.location)) }

        var tables: [NSRange] = []
        tableSeparator.enumerateMatches(in: text as String, range: NSRange(location: 0, length: text.length)) { match, _, _ in
            guard let match, match.range.location > 0,
                  !code.contains(where: { NSLocationInRange(match.range.location, $0) }) else { return }
            let header = text.paragraphRange(for: NSRange(location: match.range.location - 1, length: 0))
            guard text.substring(with: header).contains("|") else { return }
            var block = NSUnionRange(header, text.paragraphRange(for: match.range))
            while NSMaxRange(block) < text.length {
                let next = text.paragraphRange(for: NSRange(location: NSMaxRange(block), length: 0))
                guard text.substring(with: next).trimmingCharacters(in: .whitespaces).hasPrefix("|") else { break }
                block = NSUnionRange(block, next)
            }
            // Leave the final line break outside so the next line keeps its own layout.
            if NSMaxRange(block) <= text.length, block.length > 0, text.character(at: NSMaxRange(block) - 1) == 0x0A { block.length -= 1 }
            tables.append(block)
        }
        return (code, tables)
    }

    private func frontMatterEnd(in text: NSString) -> Int? {
        let lines = (text as String).components(separatedBy: "\n")
        guard let end = lines.dropFirst().firstIndex(of: "---") else { return nil }
        return lines[...end].reduce(0) { $0 + ($1 as NSString).length + 1 }
    }

    private func glyphWidth(_ range: NSRange, font: UIFont, in text: NSString) -> CGFloat {
        (text.substring(with: range) as NSString).size(withAttributes: [.font: font]).width
    }

    /// Hides syntax without turning paragraph-start glyphs null, which would wrap the line.
    private func collapseHidden(_ storage: NSTextStorage, range: NSRange, font: UIFont, in text: NSString) {
        guard range.length > 0 else { return }
        storage.addAttributes([.foregroundColor: UIColor.clear, .mdCollapsed: true], range: range)
        var location = range.location
        while location < NSMaxRange(range) {
            let character = NSRange(location: location, length: 1)
            storage.addAttribute(.kern, value: -glyphWidth(character, font: font, in: text), range: character)
            location += 1
        }
    }

    private func hideSyntax(_ storage: NSTextStorage, range: NSRange, active: Bool, line: NSRange, font: UIFont, in text: NSString) {
        guard range.location != NSNotFound, range.length > 0 else { return }
        if active {
            storage.addAttribute(.foregroundColor, value: UIColor.tertiaryLabel, range: range)
            return
        }
        let lineStart = NSRange(location: line.location, length: 1)
        if NSIntersectionRange(range, lineStart).length > 0 {
            collapseHidden(storage, range: range, font: font, in: text)
        } else {
            storage.addAttribute(.mdHidden, value: true, range: range)
        }
    }

    private func headingFont(_ level: Int) -> UIFont {
        let (size, weight): (CGFloat, UIFont.Weight) = switch level {
        case 1: (28, .bold)
        case 2: (23, .bold)
        case 3: (20, .semibold)
        default: (17, .semibold)
        }
        return UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: size, weight: weight))
    }

    private func addTraits(_ traits: UIFontDescriptor.SymbolicTraits, _ storage: NSTextStorage, _ range: NSRange) {
        storage.enumerateAttribute(.font, in: range) { value, subrange, _ in
            let font = (value as? UIFont) ?? body
            if let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(traits)) {
                storage.addAttribute(.font, value: UIFont(descriptor: descriptor, size: font.pointSize), range: subrange)
            }
        }
    }
}
