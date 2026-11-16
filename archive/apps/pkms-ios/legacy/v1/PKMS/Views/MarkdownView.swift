import SwiftUI

extension EnvironmentValues {
    /// The document being rendered; relative links and images resolve against its folder.
    @Entry var markdownDocumentPath = VaultPath.root
    @Entry var markdownListDepth = 0
}

/// Renders a sequence of Markdown blocks with native SwiftUI views.
struct MarkdownView: View {
    let blocks: [MarkdownBlock]
    var spacing: CGFloat = 14
    /// Use a lazy stack for the top level of long documents.
    var lazy = false

    var body: some View {
        if lazy {
            LazyVStack(alignment: .leading, spacing: spacing) { rows }
        } else {
            VStack(alignment: .leading, spacing: spacing) { rows }
        }
    }

    private var rows: some View {
        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
            MarkdownBlockView(block: block)
        }
    }
}

struct MarkdownBlockView: View {
    let block: MarkdownBlock

    var body: some View {
        switch block {
        case .heading(let level, let text):
            HeadingView(level: level, text: text)
        case .paragraph(let text):
            Text(MarkdownStyle.inline(text))
                .fixedSize(horizontal: false, vertical: true)
        case .image(let source, let alt):
            VaultImageView(source: source, alt: alt)
        case .codeBlock(let language, let code):
            CodeBlockView(language: language, code: code)
        case .blockQuote(let blocks):
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(.quaternary)
                    .frame(width: 4)
                MarkdownView(blocks: blocks, spacing: 10)
                    .foregroundStyle(.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
        case .list(let list):
            ListView(list: list)
        case .table(let table):
            TableView(table: table)
        case .thematicBreak:
            Divider().padding(.vertical, 6)
        case .html(let html):
            Text(html)
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

/// Inline styling that SwiftUI doesn't apply from presentation intents alone.
enum MarkdownStyle {
    static func inline(_ text: AttributedString) -> AttributedString {
        var text = text
        for run in text.runs where run.inlinePresentationIntent?.contains(.code) == true {
            text[run.range].backgroundColor = Color(.secondarySystemFill)
        }
        return text
    }
}

private struct HeadingView: View {
    let level: Int
    let text: AttributedString

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(MarkdownStyle.inline(text))
                .font(font)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if level <= 2 { Divider() }
        }
        .padding(.top, level <= 2 ? 10 : 4)
    }

    private var font: Font {
        switch level {
        case 1: .largeTitle.bold()
        case 2: .title2.bold()
        case 3: .title3.weight(.semibold)
        case 4: .headline
        default: .subheadline.weight(.semibold)
        }
    }
}

private struct CodeBlockView: View {
    let language: String?
    let code: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let language {
                Text(language)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(.callout, design: .monospaced))
                    .padding(12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct ListView: View {
    let list: MarkdownList
    @Environment(\.markdownListDepth) private var depth

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(list.items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    marker(index: index, item: item)
                        .frame(minWidth: 18, alignment: .trailing)
                    MarkdownView(blocks: item.blocks, spacing: 6)
                        .environment(\.markdownListDepth, depth + 1)
                        // Completed tasks fade and strike through, like Notion.
                        .strikethrough(item.checkbox == true)
                        .opacity(item.checkbox == true ? 0.5 : 1)
                        .animation(.easeOut(duration: 0.15), value: item.checkbox)
                }
            }
        }
    }

    @ViewBuilder
    private func marker(index: Int, item: MarkdownList.Item) -> some View {
        if let checked = item.checkbox {
            Image(systemName: checked ? "checkmark.square.fill" : "square")
                .foregroundStyle(checked ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
        } else if list.isOrdered {
            Text("\(list.startIndex + index).").monospacedDigit().foregroundStyle(.secondary)
        } else {
            Text(["•", "◦", "▪︎"][depth % 3]).foregroundStyle(.secondary)
        }
    }
}
