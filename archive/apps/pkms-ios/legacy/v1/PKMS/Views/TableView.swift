import SwiftUI
import UIKit

/// A GitHub-style table that scrolls horizontally when it's wider than the page.
struct TableView: View {
    let table: MarkdownTable
    /// Scroll horizontally when wider than the page; off when rendered to an image.
    var scrolls = true

    private static let maxColumnWidth: CGFloat = 280
    private static let cellPadding: CGFloat = 10

    var body: some View {
        if scrolls {
            ScrollView(.horizontal, showsIndicators: false) { grid }
        } else {
            grid
        }
    }

    private var grid: some View {
        let widths = columnWidths()
        return Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(widths.indices), id: \.self) { column in
                        cell(table.header[safe: column], column: column, width: widths[column])
                            .fontWeight(.semibold)
                            .background(Color(.secondarySystemBackground))
                    }
                }
                ForEach(Array(table.rows.enumerated()), id: \.offset) { _, row in
                    Divider()
                    GridRow {
                        ForEach(Array(widths.indices), id: \.self) { column in
                            cell(row[safe: column], column: column, width: widths[column])
                        }
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(.separator)))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func cell(_ text: AttributedString?, column: Int, width: CGFloat) -> some View {
        let alignment = table.alignments[safe: column] ?? .leading
        return Text(MarkdownStyle.inline(text ?? ""))
            .multilineTextAlignment(alignment.textAlignment)
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: width, alignment: alignment.frameAlignment)
            .padding(Self.cellPadding)
    }

    /// Each column is as wide as its longest single-line cell, capped so long text wraps.
    private func columnWidths() -> [CGFloat] {
        let count = max(table.header.count, table.rows.map(\.count).max() ?? 0)
        let body = UIFont.preferredFont(forTextStyle: .body)
        let bold = UIFont.boldSystemFont(ofSize: body.pointSize)
        func measure(_ text: AttributedString?, font: UIFont) -> CGFloat {
            guard let text else { return 0 }
            return ceil((String(text.characters) as NSString).size(withAttributes: [.font: font]).width)
        }
        return (0..<count).map { column in
            let header = measure(table.header[safe: column], font: bold)
            let cells = table.rows.map { measure($0[safe: column], font: body) }
            return min(Self.maxColumnWidth, max(24, ([header] + cells).max() ?? 0) + 2)
        }
    }
}

private extension MarkdownTable.Alignment {
    var textAlignment: TextAlignment {
        switch self {
        case .leading: .leading
        case .center: .center
        case .trailing: .trailing
        }
    }

    var frameAlignment: Alignment {
        switch self {
        case .leading: .leading
        case .center: .center
        case .trailing: .trailing
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
