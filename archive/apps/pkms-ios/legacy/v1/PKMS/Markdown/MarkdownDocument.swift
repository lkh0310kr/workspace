import Foundation

/// A parsed, render-ready Markdown document.
///
/// This is a disposable view model derived from the `.md` file, never stored. Inline text
/// is carried as `AttributedString` using Foundation's `inlinePresentationIntent` and
/// `link` attributes only, so the model stays UI-framework-free.
struct MarkdownDocument: Sendable {
    var blocks: [MarkdownBlock]

    /// Text of the first level-1 heading, if any.
    var title: String? {
        for case .heading(1, let text) in blocks { return String(text.characters) }
        return nil
    }
}

indirect enum MarkdownBlock: Hashable, Sendable {
    case heading(level: Int, text: AttributedString)
    case paragraph(AttributedString)
    /// An image on its own line. `source` is the raw target: a URL, a relative path, or a wiki target.
    case image(source: String, alt: String)
    case codeBlock(language: String?, code: String)
    case blockQuote([MarkdownBlock])
    case list(MarkdownList)
    case table(MarkdownTable)
    case thematicBreak
    case html(String)
}

struct MarkdownList: Hashable, Sendable {
    struct Item: Hashable, Sendable {
        /// `nil` for normal items, `true`/`false` for GFM task list items.
        var checkbox: Bool?
        var blocks: [MarkdownBlock]
    }

    var isOrdered: Bool
    var startIndex: Int
    var items: [Item]
}

struct MarkdownTable: Hashable, Sendable {
    enum Alignment: Hashable, Sendable { case leading, center, trailing }

    var alignments: [Alignment]
    var header: [AttributedString]
    var rows: [[AttributedString]]
}

/// URL scheme used for Obsidian-style `[[wiki links]]` after preprocessing.
enum WikiLink {
    static let scheme = "pkms-wiki"

    static func url(for target: String) -> String {
        let encoded = target.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? target
        return "\(scheme):\(encoded)"
    }

    /// Returns the decoded wiki target if `string` is a wiki URL.
    static func target(in string: String) -> String? {
        guard string.hasPrefix(scheme + ":") else { return nil }
        let raw = String(string.dropFirst(scheme.count + 1))
        return raw.removingPercentEncoding ?? raw
    }
}
