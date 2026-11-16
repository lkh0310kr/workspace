import Foundation
import Markdown

/// Converts Markdown text into a `MarkdownDocument`.
///
/// Parsing is done by Apple's swift-markdown (cmark-gfm), so CommonMark and GitHub-flavored
/// extensions (tables, strikethrough, task lists) behave like they do on GitHub. This type
/// only maps that syntax tree onto the app's smaller render model.
enum MarkdownParser {
    static func parse(_ text: String) -> MarkdownDocument {
        let frontMatter = frontMatterLineCount(text)
        let body = text.components(separatedBy: "\n").dropFirst(frontMatter).joined(separator: "\n")
        let document = Document(parsing: preprocessWikiLinks(body))
        return MarkdownDocument(blocks: blocks(from: document.children))
    }

    // MARK: - Preprocessing

    /// Number of lines taken by a leading YAML front matter block (`---` … `---`), common in Obsidian vaults.
    static func frontMatterLineCount(_ text: String) -> Int {
        guard text.hasPrefix("---\n") || text.hasPrefix("---\r\n") else { return 0 }
        let lines = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces.union(.newlines)) }
        guard let end = lines.dropFirst().firstIndex(where: { $0 == "---" || $0 == "..." }) else { return 0 }
        return end + 1
    }

    // Matches an inline code span (group 1, left untouched) or a wiki link:
    // group 2 = "!" for embeds, group 3 = target, group 4 = optional display text.
    private static let wikiLinkPattern = try! NSRegularExpression(
        pattern: #"(`+).*?\1|(!?)\[\[([^\[\]|\n]+)(?:\|([^\[\]\n]+))?\]\]"#
    )

    /// Rewrites `[[Page]]`, `[[Page|Title]]` and `![[image.png]]` into standard Markdown links
    /// and images with a `pkms-wiki:` URL. Fenced code blocks and inline code are left alone.
    static func preprocessWikiLinks(_ text: String) -> String {
        guard text.contains("[[") else { return text }
        var output: [String] = []
        var openFence: String?
        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if let fence = openFence {
                if trimmed.hasPrefix(fence) { openFence = nil }
                output.append(line)
                continue
            }
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                openFence = String(trimmed.prefix(3))
                output.append(line)
                continue
            }
            output.append(rewriteWikiLinks(in: line))
        }
        return output.joined(separator: "\n")
    }

    private static func rewriteWikiLinks(in line: String) -> String {
        guard line.contains("[[") else { return line }
        let ns = line as NSString
        var result = ""
        var cursor = 0
        for match in wikiLinkPattern.matches(in: line, range: NSRange(location: 0, length: ns.length)) {
            result += ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            cursor = match.range.location + match.range.length
            guard match.range(at: 3).location != NSNotFound else {
                result += ns.substring(with: match.range)  // inline code span
                continue
            }
            let isEmbed = ns.substring(with: match.range(at: 2)) == "!"
            let target = ns.substring(with: match.range(at: 3)).trimmingCharacters(in: .whitespaces)
            let alias = match.range(at: 4).location == NSNotFound ? nil : ns.substring(with: match.range(at: 4))
            let label = alias ?? target
            result += "\(isEmbed ? "!" : "")[\(label)](\(WikiLink.url(for: target)))"
        }
        result += ns.substring(from: cursor)
        return result
    }

    // MARK: - Blocks

    private static func blocks(from children: some Sequence<Markup>) -> [MarkdownBlock] {
        children.flatMap(blocks(from:))
    }

    private static func blocks(from markup: Markup) -> [MarkdownBlock] {
        switch markup {
        case let heading as Heading:
            return [.heading(level: heading.level, text: inlineText(heading.children))]
        case let paragraph as Paragraph:
            return paragraphBlocks(paragraph)
        case let code as CodeBlock:
            let language = code.language.flatMap { $0.isEmpty ? nil : $0 }
            return [.codeBlock(language: language, code: code.code.trimmingCharacters(in: .newlines))]
        case let quote as BlockQuote:
            return [.blockQuote(blocks(from: quote.children))]
        case let list as UnorderedList:
            return [.list(MarkdownList(isOrdered: false, startIndex: 1, items: listItems(list.listItems)))]
        case let list as OrderedList:
            return [.list(MarkdownList(isOrdered: true, startIndex: Int(list.startIndex), items: listItems(list.listItems)))]
        case let table as Markdown.Table:
            return [.table(tableModel(table))]
        case is ThematicBreak:
            return [.thematicBreak]
        case let html as HTMLBlock:
            return [.html(html.rawHTML.trimmingCharacters(in: .newlines))]
        default:
            // Unknown block types (e.g. block directives): fall back to their children.
            return blocks(from: markup.children)
        }
    }

    /// Splits a paragraph so that top-level images become standalone image blocks,
    /// while the surrounding text stays a paragraph.
    private static func paragraphBlocks(_ paragraph: Paragraph) -> [MarkdownBlock] {
        var result: [MarkdownBlock] = []
        var pending: [Markup] = []
        func flushText() {
            let text = inlineText(pending)
            if !text.characters.allSatisfy(\.isWhitespace) { result.append(.paragraph(text)) }
            pending.removeAll()
        }
        for child in paragraph.children {
            if let image = child as? Markdown.Image, let source = image.source, !source.isEmpty {
                flushText()
                result.append(.image(source: source, alt: image.plainText))
            } else {
                pending.append(child)
            }
        }
        flushText()
        return result
    }

    private static func listItems(_ items: some Sequence<ListItem>) -> [MarkdownList.Item] {
        items.map { item in
            let checkbox: Bool? = switch item.checkbox {
            case .checked: true
            case .unchecked: false
            case nil: nil
            }
            return MarkdownList.Item(checkbox: checkbox, blocks: blocks(from: item.children))
        }
    }

    private static func tableModel(_ table: Markdown.Table) -> MarkdownTable {
        let alignments: [MarkdownTable.Alignment] = table.columnAlignments.map {
            switch $0 {
            case .center: .center
            case .right: .trailing
            case .left, nil: .leading
            }
        }
        let header = table.head.cells.map { inlineText($0.children) }
        let rows = table.body.rows.map { row in Array(row.cells.map { inlineText($0.children) }) }
        return MarkdownTable(alignments: alignments, header: Array(header), rows: Array(rows))
    }

    // MARK: - Inline text

    private static func inlineText(_ children: some Sequence<Markup>) -> AttributedString {
        children.reduce(into: AttributedString()) { $0 += inlineText($1, intent: [], link: nil) }
    }

    private static func inlineText(_ markup: Markup, intent: InlinePresentationIntent, link: URL?) -> AttributedString {
        func children(adding newIntent: InlinePresentationIntent = [], link newLink: URL? = nil) -> AttributedString {
            markup.children.reduce(into: AttributedString()) {
                $0 += inlineText($1, intent: intent.union(newIntent), link: newLink ?? link)
            }
        }
        func run(_ string: String, adding newIntent: InlinePresentationIntent = [], link runLink: URL? = nil) -> AttributedString {
            var text = AttributedString(string)
            let combined = intent.union(newIntent)
            if !combined.isEmpty { text.inlinePresentationIntent = combined }
            if let url = runLink ?? link { text.link = url }
            return text
        }

        switch markup {
        case let text as Markdown.Text:
            return run(text.string)
        case is Emphasis:
            return children(adding: .emphasized)
        case is Strong:
            return children(adding: .stronglyEmphasized)
        case is Strikethrough:
            return children(adding: .strikethrough)
        case let code as InlineCode:
            return run(code.code, adding: .code)
        case let linkNode as Markdown.Link:
            return children(link: linkNode.destination.flatMap(makeURL))
        case let image as Markdown.Image:
            // Inline images (e.g. inside a link or table cell) are shown as their alt text.
            let label = image.plainText.isEmpty ? (image.source ?? "image") : image.plainText
            return run(label, link: image.source.flatMap(makeURL))
        case is SoftBreak:
            // A single newline is a line break, as in Obsidian and GitHub comments.
            return run("\n")
        case is LineBreak:
            return run("\n")
        case let html as InlineHTML:
            return html.rawHTML.lowercased().hasPrefix("<br") ? run("\n") : AttributedString()
        default:
            return markup.childCount > 0 ? children() : run(markup.format())
        }
    }

    /// Builds a URL from a link destination, percent-encoding paths such as `My Note.md`.
    static func makeURL(_ destination: String) -> URL? {
        if let url = URL(string: destination) { return url }
        let allowed = CharacterSet.urlFragmentAllowed.union(.urlPathAllowed)
        return destination.addingPercentEncoding(withAllowedCharacters: allowed).flatMap(URL.init(string:))
    }
}
