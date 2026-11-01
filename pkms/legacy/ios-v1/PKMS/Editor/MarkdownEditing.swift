import Foundation

/// A change produced by an editing command: replace `range` with `replacement`, then select `selection`.
/// Ranges are UTF-16 based (`NSRange`) to match `UITextView`.
struct TextEdit: Equatable {
    var range: NSRange
    var replacement: String
    var selection: NSRange
}

/// The kind of block a line is, as set by the "/" menu and the formatting bar.
enum BlockStyle: Hashable {
    case paragraph
    case heading(Int)
    case bullet
    case numbered
    case todo
    case quote
}

/// Something that can be inserted as a new block.
enum BlockInsertion {
    case codeBlock
    case divider
}

/// Pure text transformations behind the editor's commands, kept free of UIKit so they're easy to test.
enum MarkdownEditing {
    // MARK: - Line prefixes

    /// indent, then an optional marker: heading, task, bullet, number or quote.
    private static let prefixRegex = try! NSRegularExpression(
        pattern: #"^([ \t]*)(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d{1,9}[.)] |> ?)?"#
    )

    struct LinePrefix {
        var indent: String
        var marker: String
        var length: Int { (indent + marker).utf16.count }

        var style: BlockStyle {
            if marker.hasPrefix("#") { return .heading(marker.count - 1) }
            if marker.hasPrefix(">") { return .quote }
            if marker.contains("[") { return .todo }
            if marker.first?.isNumber == true { return .numbered }
            if !marker.isEmpty { return .bullet }
            return .paragraph
        }

        var isList: Bool { [.bullet, .numbered, .todo].contains(style) }
    }

    static func prefix(of line: String) -> LinePrefix {
        let ns = line as NSString
        guard let match = prefixRegex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) else {
            return LinePrefix(indent: "", marker: "")
        }
        let marker = match.range(at: 2).location == NSNotFound ? "" : ns.substring(with: match.range(at: 2))
        return LinePrefix(indent: ns.substring(with: match.range(at: 1)), marker: marker)
    }

    /// Range of the full lines touched by `selection`, without the final line break.
    static func lineRange(in text: NSString, for selection: NSRange) -> NSRange {
        var range = text.lineRange(for: selection)
        while range.length > 0, [0x0A, 0x0D].contains(text.character(at: range.location + range.length - 1)) {
            range.length -= 1
        }
        return range
    }

    // MARK: - Block styles

    /// Converts the selected lines to `style`. Applying a style the lines already have turns them back into paragraphs.
    static func setBlockStyle(_ style: BlockStyle, in text: String, selection: NSRange) -> TextEdit {
        let ns = text as NSString
        let range = lineRange(in: ns, for: selection)
        let lines = ns.substring(with: range).components(separatedBy: "\n")
        let prefixes = lines.map(prefix(of:))
        let target: BlockStyle = prefixes.allSatisfy({ $0.style == style }) ? .paragraph : style

        var newLines: [String] = []
        for (i, line) in lines.enumerated() {
            let old = prefixes[i]
            let content = String(line.utf16.dropFirst(old.length)) ?? ""
            let keepsIndent = target != .paragraph || old.isList
            let indent = keepsIndent && !isHeadingOrQuote(target) ? old.indent : ""
            newLines.append(indent + marker(for: target, number: i + 1) + content)
        }
        let replacement = newLines.joined(separator: "\n")

        let selectionAfter: NSRange
        if lines.count == 1 {
            let delta = (replacement.utf16.count - lines[0].utf16.count)
            let newPrefixEnd = range.location + prefix(of: replacement).length
            let caret = max(newPrefixEnd, selection.location + delta)
            selectionAfter = NSRange(location: min(caret, range.location + replacement.utf16.count), length: 0)
        } else {
            selectionAfter = NSRange(location: range.location, length: replacement.utf16.count)
        }
        return TextEdit(range: range, replacement: replacement, selection: selectionAfter)
    }

    private static func isHeadingOrQuote(_ style: BlockStyle) -> Bool {
        if case .heading = style { return true }
        return style == .quote
    }

    private static func marker(for style: BlockStyle, number: Int) -> String {
        switch style {
        case .paragraph: ""
        case .heading(let level): String(repeating: "#", count: min(max(level, 1), 6)) + " "
        case .bullet: "- "
        case .numbered: "\(number). "
        case .todo: "- [ ] "
        case .quote: "> "
        }
    }

    /// Inserts a code block or divider on the current line if it's empty, or below it otherwise.
    static func insert(_ block: BlockInsertion, in text: String, selection: NSRange) -> TextEdit {
        let ns = text as NSString
        let line = lineRange(in: ns, for: NSRange(location: selection.location, length: 0))
        let lineIsEmpty = ns.substring(with: line).trimmingCharacters(in: .whitespaces).isEmpty
        let insertAt = lineIsEmpty ? line : NSRange(location: line.location + line.length, length: 0)
        let lead = lineIsEmpty ? "" : "\n"
        switch block {
        case .codeBlock:
            let replacement = lead + "```\n\n```"
            let caret = insertAt.location + (lead + "```\n").utf16.count
            return TextEdit(range: insertAt, replacement: replacement, selection: NSRange(location: caret, length: 0))
        case .divider:
            let replacement = lead + "---\n"
            let caret = insertAt.location + replacement.utf16.count
            return TextEdit(range: insertAt, replacement: replacement, selection: NSRange(location: caret, length: 0))
        }
    }

    // MARK: - Return key

    /// Notion-style list behavior for the return key: continue the list on a new line, or,
    /// on an empty item, outdent it or end the list. Returns `nil` to insert a plain line break.
    static func returnKey(in text: String, selection: NSRange) -> TextEdit? {
        guard selection.length == 0 else { return nil }
        let ns = text as NSString
        let line = lineRange(in: ns, for: selection)
        let lineText = ns.substring(with: line)
        let linePrefix = prefix(of: lineText)
        guard linePrefix.isList || linePrefix.style == .quote,
              selection.location >= line.location + linePrefix.length else { return nil }

        let content = String(lineText.utf16.dropFirst(linePrefix.length)) ?? ""
        if content.trimmingCharacters(in: .whitespaces).isEmpty {
            // Empty item: outdent if nested, otherwise end the list. Ending leaves a blank line,
            // because Markdown would otherwise fold the next line into the last item.
            let newIndent = linePrefix.indent.isEmpty ? "" : outdented(linePrefix.indent, in: ns, before: line.location)
            let replacement = linePrefix.indent.isEmpty
                ? (line.location > 0 ? "\n" : "")
                : newIndent + linePrefix.marker
            return TextEdit(range: line, replacement: replacement,
                            selection: NSRange(location: line.location + replacement.utf16.count, length: 0))
        }

        let next = linePrefix.indent + continuedMarker(linePrefix.marker)
        let insertion = "\n" + next
        return TextEdit(range: selection, replacement: insertion,
                        selection: NSRange(location: selection.location + insertion.utf16.count, length: 0))
    }

    /// Notion-style delete at the start of a block's content. A nested list item outdents; any other
    /// marker (bullet, checkbox, number, heading, quote) is removed so the line becomes plain text.
    /// Returns `nil` for an ordinary backspace.
    static func backspaceKey(in text: String, selection: NSRange) -> TextEdit? {
        guard selection.length == 0 else { return nil }
        let ns = text as NSString
        let line = lineRange(in: ns, for: selection)
        let linePrefix = prefix(of: ns.substring(with: line))
        guard !linePrefix.marker.isEmpty, selection.location == line.location + linePrefix.length else { return nil }
        let prefixRange = NSRange(location: line.location, length: linePrefix.length)
        if linePrefix.isList, !linePrefix.indent.isEmpty {
            let replacement = outdented(linePrefix.indent, in: ns, before: line.location) + linePrefix.marker
            return TextEdit(range: prefixRange, replacement: replacement,
                            selection: NSRange(location: line.location + replacement.utf16.count, length: 0))
        }
        return TextEdit(range: prefixRange, replacement: "", selection: NSRange(location: line.location, length: 0))
    }

    private static func continuedMarker(_ marker: String) -> String {
        if marker.contains("[") { return String(marker.prefix(1)) + " [ ] " }
        if let first = marker.first, first.isNumber {
            let digits = marker.prefix { $0.isNumber }
            let delimiter = marker.dropFirst(digits.count).prefix(1)
            return "\((Int(digits) ?? 0) + 1)\(delimiter) "
        }
        if marker.hasPrefix(">") { return "> " }
        return marker
    }

    // MARK: - Indentation

    static func indent(in text: String, selection: NSRange) -> TextEdit {
        let ns = text as NSString
        let range = lineRange(in: ns, for: selection)
        let lines = ns.substring(with: range).components(separatedBy: "\n")
        // Nest under the previous list item's content so Markdown treats it as a child.
        var unit = "  "
        if let parent = previousListPrefix(in: ns, before: range.location) {
            let current = prefix(of: lines[0]).indent
            let target = parent.indent + String(repeating: " ", count: parent.marker.contains("[") ? 2 : parent.marker.count)
            if target.count > current.count { unit = String(repeating: " ", count: target.count - current.count) }
        }
        return transformLines(lines, range: range, selection: selection) { unit + $0 }
    }

    static func outdent(in text: String, selection: NSRange) -> TextEdit {
        let ns = text as NSString
        let range = lineRange(in: ns, for: selection)
        let lines = ns.substring(with: range).components(separatedBy: "\n")
        let current = prefix(of: lines[0]).indent
        let removeCount = current.count - outdented(current, in: ns, before: range.location).count
        return transformLines(lines, range: range, selection: selection) { line in
            let leading = line.prefix { $0 == " " || $0 == "\t" }.count
            return String(line.dropFirst(min(leading, max(removeCount, 1))))
        }
    }

    private static func transformLines(_ lines: [String], range: NSRange, selection: NSRange,
                                       _ transform: (String) -> String) -> TextEdit {
        let newLines = lines.map(transform)
        let replacement = newLines.joined(separator: "\n")
        if lines.count == 1 {
            let delta = replacement.utf16.count - lines[0].utf16.count
            let caret = max(range.location, selection.location + delta)
            return TextEdit(range: range, replacement: replacement,
                            selection: NSRange(location: caret, length: selection.length))
        }
        return TextEdit(range: range, replacement: replacement,
                        selection: NSRange(location: range.location, length: replacement.utf16.count))
    }

    /// The indent of the nearest earlier list item that is shallower than `indent`.
    private static func outdented(_ indent: String, in text: NSString, before location: Int) -> String {
        var cursor = location
        while cursor > 0 {
            let line = lineRange(in: text, for: NSRange(location: cursor - 1, length: 0))
            let p = prefix(of: text.substring(with: line))
            if p.isList, p.indent.count < indent.count { return p.indent }
            cursor = line.location
        }
        return ""
    }

    private static func previousListPrefix(in text: NSString, before location: Int) -> LinePrefix? {
        guard location > 0 else { return nil }
        let line = lineRange(in: text, for: NSRange(location: location - 1, length: 0))
        let p = prefix(of: text.substring(with: line))
        return p.isList ? p : nil
    }

    // MARK: - Inline formatting

    /// Wraps the selection in `marker` (e.g. `**`), or unwraps it if it's already wrapped.
    static func toggleWrap(_ marker: String, in text: String, selection: NSRange) -> TextEdit {
        let ns = text as NSString
        let m = marker.utf16.count
        if selection.length == 0 {
            return TextEdit(range: selection, replacement: marker + marker,
                            selection: NSRange(location: selection.location + m, length: 0))
        }
        let selected = ns.substring(with: selection)
        // Markers just outside the selection.
        if selection.location >= m, selection.location + selection.length + m <= ns.length,
           ns.substring(with: NSRange(location: selection.location - m, length: m)) == marker,
           ns.substring(with: NSRange(location: selection.location + selection.length, length: m)) == marker {
            let outer = NSRange(location: selection.location - m, length: selection.length + 2 * m)
            return TextEdit(range: outer, replacement: selected,
                            selection: NSRange(location: outer.location, length: selection.length))
        }
        // Markers inside the selection.
        if selected.utf16.count >= 2 * m, selected.hasPrefix(marker), selected.hasSuffix(marker) {
            let inner = String(selected.utf16.dropFirst(m).dropLast(m)) ?? selected
            return TextEdit(range: selection, replacement: inner,
                            selection: NSRange(location: selection.location, length: inner.utf16.count))
        }
        return TextEdit(range: selection, replacement: marker + selected + marker,
                        selection: NSRange(location: selection.location + m, length: selection.length))
    }

    /// Inserts `[selection](…)` with the cursor placed where the URL goes.
    static func insertLink(in text: String, selection: NSRange) -> TextEdit {
        let label = (text as NSString).substring(with: selection)
        let replacement = "[\(label)]()"
        let caret = label.isEmpty ? selection.location + 1 : selection.location + label.utf16.count + 3
        return TextEdit(range: selection, replacement: replacement, selection: NSRange(location: caret, length: 0))
    }

    // MARK: - Suggestions

    enum SuggestionKind: Equatable {
        /// The "/" block menu.
        case command
        /// `[[` page links.
        case page
    }

    struct SuggestionContext: Equatable {
        var kind: SuggestionKind
        var query: String
        /// The trigger plus query, replaced when a suggestion is chosen.
        var range: NSRange
    }

    private static let commandTrigger = try! NSRegularExpression(pattern: #"(?:^|\s)(/([\p{L}\p{N}]{0,20}))$"#)
    private static let pageTrigger = try! NSRegularExpression(pattern: #"(\[\[([^\[\]\n]{0,60}))$"#)

    /// Detects an in-progress "/" command or `[[` link just before the cursor.
    static func suggestionContext(in text: String, selection: NSRange) -> SuggestionContext? {
        guard selection.length == 0 else { return nil }
        let ns = text as NSString
        let line = lineRange(in: ns, for: selection)
        let beforeCaret = NSRange(location: line.location, length: selection.location - line.location)
        guard beforeCaret.length >= 0 else { return nil }
        let head = ns.substring(with: beforeCaret)
        let headRange = NSRange(location: 0, length: (head as NSString).length)
        for (regex, kind) in [(pageTrigger, SuggestionKind.page), (commandTrigger, .command)] {
            if let match = regex.firstMatch(in: head, range: headRange) {
                let trigger = match.range(at: 1)
                return SuggestionContext(
                    kind: kind,
                    query: (head as NSString).substring(with: match.range(at: 2)),
                    range: NSRange(location: line.location + trigger.location, length: trigger.length)
                )
            }
        }
        return nil
    }
}
