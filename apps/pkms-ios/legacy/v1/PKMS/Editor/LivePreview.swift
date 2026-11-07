import SwiftUI
import UIKit

// Live preview works like Obsidian's: the text view always holds the note's exact Markdown, and
// rendering happens through attributes. Syntax characters are hidden (turned into zero-width
// glyphs), and things text can't show—checkboxes, bullets, rules, images, tables—are drawn by
// the layout manager in the space those characters occupy. Nothing is ever inserted into the text.

extension NSAttributedString.Key {
    /// Characters laid out as nothing (Markdown syntax that isn't being edited).
    static let mdHidden = NSAttributedString.Key("pkms.hidden")
    /// Paragraph-start syntax collapsed to zero width without turning glyphs null.
    static let mdCollapsed = NSAttributedString.Key("pkms.collapsed")
    /// Something drawn in place of, or behind, the characters it covers.
    static let mdDecoration = NSAttributedString.Key("pkms.decoration")
    /// A tappable link target: a URL, a relative path, or a `pkms-wiki:` target.
    static let mdLink = NSAttributedString.Key("pkms.link")
}

/// Shared layout numbers for rendered lists.
enum LivePreviewMetrics {
    /// Horizontal space reserved before a list item's text, where its bullet, checkbox or number is drawn.
    static let listGutter: CGFloat = 28

    /// Extra left offset for a nested item. Two spaces (one Markdown nesting level) move it one gutter.
    static func nestOffset(forIndent indent: String) -> CGFloat {
        let columns = indent.reduce(0) { $0 + ($1 == "\t" ? 2 : 1) }
        return CGFloat(columns) / 2 * listGutter
    }
}

final class MarkdownDecoration: NSObject {
    enum Kind {
        case bullet
        case checkbox(checked: Bool)
        /// An ordered item's label such as "1." or "2)".
        case number(String)
        case rule
        case quoteBar
        case codeBlock
        /// A block (image or table) drawn as a picture of the given size on its first line.
        case widget(key: String, size: CGSize)
    }

    let kind: Kind

    init(_ kind: Kind) {
        self.kind = kind
    }

    var isWidget: Bool { if case .widget = kind { true } else { false } }
}

/// Rendered images and tables, keyed by their Markdown source.
@MainActor
final class WidgetCache {
    enum Entry {
        case loading
        case image(UIImage)
        case failed
    }

    private var entries: [String: Entry] = [:]
    /// Loads an image referenced from the note; set by the editor host.
    var loadImage: (String) async -> UIImage? = { _ in nil }
    /// Called when an image finishes loading so the text can be laid out again.
    var onChange: () -> Void = {}

    func image(forSource source: String) -> Entry {
        if let entry = entries[source] { return entry }
        entries[source] = .loading
        Task {
            let image = await loadImage(source)
            entries[source] = image.map(Entry.image) ?? .failed
            onChange()
        }
        return .loading
    }

    /// Renders a table at its natural size; wide tables are scaled down to fit when drawn.
    func table(_ table: MarkdownTable, key: String, dark: Bool) -> UIImage? {
        let cacheKey = "table|\(dark)|" + key
        if case .image(let image) = entries[cacheKey] { return image }
        let renderer = ImageRenderer(content:
            TableView(table: table, scrolls: false)
                .environment(\.colorScheme, dark ? .dark : .light)
        )
        renderer.scale = UITraitCollection.current.displayScale
        guard let image = renderer.uiImage else { return nil }
        entries[cacheKey] = .image(image)
        return image
    }

    func renderedTable(key: String, dark: Bool) -> UIImage? {
        if case .image(let image) = entries["table|\(dark)|" + key] { return image }
        return nil
    }

    func loadedImage(forSource source: String) -> UIImage? {
        if case .image(let image) = entries[source] { return image }
        return nil
    }

    /// Images can be replaced or created by sync while the note stays open.
    func invalidateImages() {
        entries = entries.filter { $0.key.hasPrefix("table|") }
        onChange()
    }
}

/// Hides syntax glyphs and draws decorations.
final class LivePreviewLayoutManager: NSLayoutManager, NSLayoutManagerDelegate {
    /// Supplies rendered widgets at draw time.
    /// Only touched on the main thread, where UIKit lays out and draws text views.
    nonisolated(unsafe) weak var widgets: WidgetCache?

    override init() {
        super.init()
        delegate = self
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    // MARK: Hiding

    func layoutManager(_ layoutManager: NSLayoutManager,
                       shouldGenerateGlyphs glyphs: UnsafePointer<CGGlyph>,
                       properties: UnsafePointer<NSLayoutManager.GlyphProperty>,
                       characterIndexes: UnsafePointer<Int>,
                       font: UIFont,
                       forGlyphRange glyphRange: NSRange) -> Int {
        guard let storage = textStorage else { return 0 }
        var modified: [NSLayoutManager.GlyphProperty]?
        for i in 0..<glyphRange.length {
            let index = characterIndexes[i]
            guard index < storage.length, storage.attribute(.mdHidden, at: index, effectiveRange: nil) != nil else { continue }
            if modified == nil { modified = Array(UnsafeBufferPointer(start: properties, count: glyphRange.length)) }
            modified![i] = .null
        }
        guard let modified else { return 0 }
        modified.withUnsafeBufferPointer { buffer in
            setGlyphs(glyphs, properties: buffer.baseAddress!, characterIndexes: characterIndexes, font: font, forGlyphRange: glyphRange)
        }
        return glyphRange.length
    }

    // MARK: Drawing

    override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
        super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
        guard let storage = textStorage, let container = textContainers.first else { return }
        let characters = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
        storage.enumerateAttribute(.mdDecoration, in: characters) { value, range, _ in
            guard let decoration = value as? MarkdownDecoration else { return }
            switch decoration.kind {
            case .codeBlock:
                let rect = blockRect(for: range, in: container).offsetBy(dx: origin.x, dy: origin.y)
                UIColor.secondarySystemBackground.setFill()
                UIBezierPath(roundedRect: rect.insetBy(dx: -2, dy: -4), cornerRadius: 8).fill()
            case .quoteBar:
                let rect = blockRect(for: range, in: container).offsetBy(dx: origin.x, dy: origin.y)
                UIColor.tertiaryLabel.setFill()
                UIBezierPath(roundedRect: CGRect(x: rect.minX, y: rect.minY + 2, width: 3, height: rect.height - 4), cornerRadius: 1.5).fill()
            default:
                break
            }
        }
    }

    override func drawGlyphs(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
        super.drawGlyphs(forGlyphRange: glyphsToShow, at: origin)
        guard let storage = textStorage, let container = textContainers.first else { return }
        let characters = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
        storage.enumerateAttribute(.mdDecoration, in: characters) { value, range, _ in
            guard let decoration = value as? MarkdownDecoration else { return }
            let glyphs = glyphRange(forCharacterRange: range, actualCharacterRange: nil)
            switch decoration.kind {
            case .bullet:
                guard let gutter = listGutter(forCharacterRange: range, in: container) else { return }
                let size = gutter.font.pointSize * 0.34
                let center = CGPoint(x: gutter.frame.midX + origin.x, y: gutter.markCenterY + origin.y)
                UIColor.label.setFill()
                UIBezierPath(ovalIn: CGRect(x: center.x - size / 2, y: center.y - size / 2, width: size, height: size)).fill()
            case .checkbox(let checked):
                guard let gutter = listGutter(forCharacterRange: range, in: container) else { return }
                let box = checkboxFrame(in: gutter).offsetBy(dx: origin.x, dy: origin.y)
                let config = UIImage.SymbolConfiguration(pointSize: box.width * 0.92, weight: .regular)
                let symbol = UIImage(systemName: checked ? "checkmark.square.fill" : "square", withConfiguration: config)?
                    .withTintColor(checked ? .tintColor : .secondaryLabel, renderingMode: .alwaysOriginal)
                symbol?.draw(in: box.insetBy(dx: (box.width - (symbol?.size.width ?? box.width)) / 2,
                                              dy: (box.height - (symbol?.size.height ?? box.height)) / 2))
            case .number(let label):
                guard let gutter = listGutter(forCharacterRange: range, in: container) else { return }
                let attributes: [NSAttributedString.Key: Any] = [.font: gutter.font, .foregroundColor: UIColor.secondaryLabel]
                let size = (label as NSString).size(withAttributes: attributes)
                // Right-aligned against the text so "9." and "10." line up on their dots.
                let point = CGPoint(x: gutter.frame.maxX - 6 - size.width + origin.x, y: gutter.baseline - gutter.font.ascender + origin.y)
                (label as NSString).draw(at: point, withAttributes: attributes)
            case .rule:
                let line = lineFragmentRect(forGlyphAt: glyphs.location, effectiveRange: nil).offsetBy(dx: origin.x, dy: origin.y)
                UIColor.separator.setFill()
                UIRectFill(CGRect(x: line.minX + container.lineFragmentPadding, y: line.midY, width: line.width - 2 * container.lineFragmentPadding, height: 1))
            case .widget(let key, let size):
                let line = lineFragmentRect(forGlyphAt: glyphs.location, effectiveRange: nil).offsetBy(dx: origin.x, dy: origin.y)
                let frame = CGRect(x: line.minX + container.lineFragmentPadding, y: line.minY + 6, width: size.width, height: size.height)
                let widgets = widgets
                MainActor.assumeIsolated { Self.drawWidget(widgets, key: key, in: frame) }
            default:
                break
            }
        }
    }

    @MainActor
    private static func drawWidget(_ widgets: WidgetCache?, key: String, in frame: CGRect) {
        let image = widgets?.loadedImage(forSource: key)
            ?? widgets?.renderedTable(key: key, dark: UITraitCollection.current.userInterfaceStyle == .dark)
        if let image {
            UIBezierPath(roundedRect: frame, cornerRadius: 8).addClip()
            image.draw(in: frame)
        } else {
            UIColor.secondarySystemBackground.setFill()
            UIBezierPath(roundedRect: frame, cornerRadius: 8).fill()
            let config = UIImage.SymbolConfiguration(pointSize: 18)
            if let icon = UIImage(systemName: "photo", withConfiguration: config)?.withTintColor(.tertiaryLabel, renderingMode: .alwaysOriginal) {
                icon.draw(at: CGPoint(x: frame.midX - icon.size.width / 2, y: frame.midY - icon.size.height / 2))
            }
        }
    }

    /// Where a list item's mark goes: the gutter just left of its text on the first line.
    struct ListGutter {
        /// Container coordinates (no text view inset applied).
        var frame: CGRect
        var baseline: CGFloat
        var font: UIFont
        /// Vertical center of the text on this line. Bullets and boxes are drawn around it.
        var markCenterY: CGFloat
    }

    /// Gutter for the list item whose hidden marker spans `range`, or `nil` if it isn't laid out.
    func listGutter(forCharacterRange range: NSRange, in container: NSTextContainer) -> ListGutter? {
        guard let storage = textStorage, range.location < storage.length else { return nil }
        var lineGlyphs = NSRange()
        let style = storage.attribute(.paragraphStyle, at: range.location, effectiveRange: nil) as? NSParagraphStyle
        let font = storage.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont ?? .preferredFont(forTextStyle: .body)
        // Hidden marker glyphs report a position above the text, and sometimes on the previous line.
        // Anchor to the first visible character of the item.
        let ns = storage.string as NSString
        var anchor = range.location
        while anchor < ns.length {
            let scalar = ns.character(at: anchor)
            if scalar == 0x0A || scalar == 0x0D { break }
            let anchorGlyph = glyphIndexForCharacter(at: anchor)
            if storage.attribute(.mdHidden, at: anchor, effectiveRange: nil) == nil,
               storage.attribute(.mdCollapsed, at: anchor, effectiveRange: nil) == nil,
               anchorGlyph < numberOfGlyphs, !propertyForGlyph(at: anchorGlyph).contains(.null) {
                break
            }
            anchor += 1
        }
        let anchorGlyph = glyphIndexForCharacter(at: min(anchor, max(ns.length - 1, 0)))
        guard anchorGlyph < numberOfGlyphs else { return nil }
        let fragment = lineFragmentRect(forGlyphAt: anchorGlyph, effectiveRange: &lineGlyphs)
        guard !fragment.isEmpty else { return nil }
        let contentX = fragment.minX + container.lineFragmentPadding + (style?.firstLineHeadIndent ?? 0)
        var baseline = fragment.minY + font.ascender
        var markCenter = baseline - font.xHeight / 2
        if anchor < ns.length, ns.character(at: anchor) != 0x0A, ns.character(at: anchor) != 0x0D {
            baseline = fragment.minY + location(forGlyphAt: anchorGlyph).y
            let bounds = boundingRect(forGlyphRange: NSRange(location: anchorGlyph, length: 1), in: container)
            if bounds.height > 0.5 { markCenter = bounds.midY }
        }
        let frame = CGRect(x: contentX - LivePreviewMetrics.listGutter, y: fragment.minY, width: LivePreviewMetrics.listGutter, height: fragment.height)
        return ListGutter(frame: frame, baseline: baseline, font: font, markCenterY: markCenter)
    }

    /// The drawn checkbox, centered in its gutter (container coordinates).
    func checkboxFrame(in gutter: ListGutter) -> CGRect {
        let side = min(18, gutter.font.lineHeight)
        return CGRect(x: gutter.frame.midX - side / 2, y: gutter.markCenterY - side / 2, width: side, height: side)
    }

    /// Union of the line fragments covering `characters`, spanning the full container width.
    private func blockRect(for characters: NSRange, in container: NSTextContainer) -> CGRect {
        let glyphs = glyphRange(forCharacterRange: characters, actualCharacterRange: nil)
        var rect = CGRect.null
        enumerateLineFragments(forGlyphRange: glyphs) { fragment, _, _, _, _ in rect = rect.union(fragment) }
        guard !rect.isNull else { return .zero }
        return CGRect(x: rect.minX + container.lineFragmentPadding, y: rect.minY,
                      width: rect.width - 2 * container.lineFragmentPadding, height: rect.height)
    }
}
