import Foundation
import Testing
@testable import PKMS

struct MarkdownParserTests {
    @Test func parsesCommonBlocks() {
        let document = MarkdownParser.parse("""
        # Title

        Some **bold** text.

        > quoted

        ---

        ```swift
        let x = 1
        ```
        """)
        #expect(document.title == "Title")
        guard document.blocks.count == 5 else {
            Issue.record("Unexpected blocks: \(document.blocks)")
            return
        }
        #expect(document.blocks[3] == .thematicBreak)
        #expect(document.blocks[4] == .codeBlock(language: "swift", code: "let x = 1"))
        guard case .paragraph(let text) = document.blocks[1] else {
            Issue.record("Expected paragraph")
            return
        }
        let bold = text.runs.first { $0.inlinePresentationIntent == .stronglyEmphasized }
        #expect(bold.map { String(text[$0.range].characters) } == "bold")
    }

    @Test func parsesListsAndTasks() {
        let document = MarkdownParser.parse("3. a\n4. b\n\n- [x] done\n- [ ] todo")
        guard case .list(let ordered) = document.blocks.first, case .list(let tasks) = document.blocks.last else {
            Issue.record("Expected two lists")
            return
        }
        #expect(ordered.isOrdered && ordered.startIndex == 3 && ordered.items.count == 2)
        #expect(tasks.items.map(\.checkbox) == [true, false])
    }

    @Test func parsesTables() {
        let document = MarkdownParser.parse("| A | B |\n|:--|--:|\n| 1 | 2 |")
        guard case .table(let table) = document.blocks.first else {
            Issue.record("Expected table")
            return
        }
        #expect(table.alignments == [.leading, .trailing])
        #expect(table.header.map { String($0.characters) } == ["A", "B"])
        #expect(table.rows.map { $0.map { String($0.characters) } } == [["1", "2"]])
    }

    @Test func standaloneImagesBecomeBlocks() {
        let document = MarkdownParser.parse("Before ![Alt](img.png) after")
        #expect(document.blocks.count == 3)
        #expect(document.blocks[1] == .image(source: "img.png", alt: "Alt"))
    }

    @Test func rewritesWikiLinks() {
        let rewritten = MarkdownParser.preprocessWikiLinks("See [[My Page]], [[a|Alias]] and ![[pic.png]].")
        #expect(rewritten == "See [My Page](pkms-wiki:My%20Page), [Alias](pkms-wiki:a) and ![pic.png](pkms-wiki:pic.png).")
    }

    @Test func leavesCodeAlone() {
        let text = "`[[not a link]]` [[Link]]\n```\n[[also not]]\n```"
        #expect(MarkdownParser.preprocessWikiLinks(text) == "`[[not a link]]` [Link](pkms-wiki:Link)\n```\n[[also not]]\n```")
    }

    @Test func singleNewlineIsLineBreak() {
        guard case .paragraph(let text) = MarkdownParser.parse("one\ntwo").blocks.first else {
            Issue.record("Expected paragraph")
            return
        }
        #expect(String(text.characters) == "one\ntwo")
    }

    @Test func stripsFrontMatter() {
        let document = MarkdownParser.parse("---\ntags: [a]\n---\n# Heading")
        #expect(document.blocks.count == 1)
        #expect(document.title == "Heading")
    }
}

struct FileIndexTests {
    private let index = FileIndex(root: VaultNode(path: .root, kind: .folder, children: [
        VaultNode(path: VaultPath("Assets"), kind: .folder, children: [
            VaultNode(path: VaultPath("Assets/pic.png"), kind: .asset),
        ]),
        VaultNode(path: VaultPath("Notes"), kind: .folder, children: [
            VaultNode(path: VaultPath("Notes/My Page.md"), kind: .markdown),
        ]),
        VaultNode(path: VaultPath("README.md"), kind: .markdown),
    ]))

    @Test func resolvesWikiLinksByName() {
        #expect(index.resolve("my page", from: VaultPath("README.md"), isWikiLink: true) == VaultPath("Notes/My Page.md"))
        #expect(index.resolve("pic.png", from: VaultPath("README.md"), isWikiLink: true) == VaultPath("Assets/pic.png"))
        #expect(index.resolve("Missing", from: VaultPath("README.md"), isWikiLink: true) == nil)
    }

    @Test func resolvesRelativePaths() {
        let note = VaultPath("Notes/My Page.md")
        #expect(index.resolve("../Assets/pic.png", from: note, isWikiLink: false) == VaultPath("Assets/pic.png"))
        #expect(index.resolve("../README.md", from: note, isWikiLink: false) == VaultPath("README.md"))
        #expect(index.resolve("Notes/My%20Page.md", from: VaultPath("README.md"), isWikiLink: false) == note)
    }

    @Test func searchesFileNames() {
        #expect(index.search("page").map(\.path) == [VaultPath("Notes/My Page.md")])
    }

    @Test func scansLocalDirectory() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root.appending(path: "Sub/.git"), withIntermediateDirectories: true)
        try "# A".write(to: root.appending(path: "Sub/a.md"), atomically: true, encoding: .utf8)
        try "x".write(to: root.appending(path: "Sub/.git/HEAD"), atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: root) }

        let repository = LocalVaultRepository(rootURL: root)
        let index = try await repository.loadIndex()
        #expect(index.root.children.map(\.path) == [VaultPath("Sub")])
        #expect(index.node(at: VaultPath("Sub"))?.children.map(\.path) == [VaultPath("Sub/a.md")])
        #expect(try await repository.readText(at: VaultPath("Sub/a.md")) == "# A")
    }
}
