import XCTest

/// Runs against the bundled sample vault (a fresh install).
final class EditorUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testCreateNoteWithSlashCommandAndChecklist() {
        let app = XCUIApplication()
        app.launch()

        // New note opens straight into the editor with the keyboard up.
        app.buttons["New Note"].firstMatch.tap()
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        dismissKeyboardTip(app)
        XCTAssertTrue(app.buttons["Bold"].waitForExistence(timeout: 5), "Formatting bar should appear above the keyboard")

        editor.typeText("Groceries\n/to")
        XCTAssertTrue(app.buttons["To-do List"].waitForExistence(timeout: 3), "Typing / should open the block menu")
        attach(app, "slash-menu")
        app.buttons["To-do List"].tap()
        editor.typeText("Milk\nEggs\n\nDone for today")
        attach(app, "editing")

        XCTAssertEqual(editor.value as? String, "# Groceries\n- [ ] Milk\n- [ ] Eggs\n\nDone for today")

        // Dismissing the keyboard renders the whole note and names the file after its first line.
        app.buttons["Done"].tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 5), "Untitled note should be renamed from its title")
        attach(app, "rendered")

        // Tapping a drawn checkbox checks the task without opening the keyboard.
        let note = app.textViews.firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 5))
        checkbox(in: note, line: 1).tap()
        XCTAssertEqual(note.value as? String, "# Groceries\n- [x] Milk\n- [ ] Eggs\n\nDone for today")
        XCTAssertFalse(app.buttons["Done"].exists, "Toggling a checkbox shouldn't start editing")
        attach(app, "checked")
    }

    @MainActor
    func testShowcaseRendersInPlace() {
        let app = XCUIApplication()
        app.launch()
        app.buttons["Notes"].firstMatch.tap()
        app.buttons["Markdown Showcase"].firstMatch.tap()
        let note = app.textViews.firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 5))
        attach(app, "showcase-top")
        note.swipeUp(velocity: .slow)
        attach(app, "showcase-middle")
        note.swipeUp(velocity: .slow)
        note.swipeUp(velocity: .slow)
        attach(app, "showcase-bottom")
    }

    /// Where the checkbox of the task on `line` (1-based, below a level-1 heading) is drawn.
    @MainActor
    private func checkbox(in note: XCUIElement, line: Int) -> XCUICoordinate {
        // Measured from screenshots: text inset 16 + line padding 5, box 20 wide; items 24pt apart below the title.
        return note.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: 21 + 10, dy: 35 + CGFloat(line) * 24))
    }

    @MainActor
    func testPageLinkSuggestions() {
        let app = XCUIApplication()
        app.launch()
        app.buttons["New Note"].firstMatch.tap()
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        dismissKeyboardTip(app)

        editor.typeText("Links\nSee [[Show")
        XCTAssertTrue(app.buttons["Markdown Showcase"].waitForExistence(timeout: 3), "[[ should suggest pages")
        attach(app, "page-suggestions")
        app.buttons["Markdown Showcase"].tap()
        XCTAssertEqual(editor.value as? String, "# Links\nSee [[Markdown Showcase]]")
    }

    /// The simulator keyboard shows a one-time "slide to type" tip that blocks input.
    @MainActor
    private func dismissKeyboardTip(_ app: XCUIApplication) {
        let tip = app.buttons["Continue"]
        if tip.waitForExistence(timeout: 2) { tip.tap() }
    }

    @MainActor
    private func attach(_ app: XCUIApplication, _ name: String) {
        Thread.sleep(forTimeInterval: 0.6)  // let transitions settle
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
