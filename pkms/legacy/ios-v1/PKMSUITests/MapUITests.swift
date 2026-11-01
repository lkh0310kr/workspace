import XCTest

/// Runs against the bundled sample vault (a fresh install), which includes `Places.map`.
final class MapUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testMapShowsSavedPlacesAndFindsOne() {
        let app = XCUIApplication()
        app.launch()

        // Earlier tests may leave a Recent section on top that pushes the row off screen.
        let places = app.buttons["Places"].firstMatch
        for _ in 0..<4 where !places.waitForExistence(timeout: 2) { app.swipeUp() }
        places.tap()
        let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow While Using App"]
        if allow.waitForExistence(timeout: 5) { allow.tap() }
        XCTAssertTrue(app.buttons["Filter"].waitForExistence(timeout: 5))
        attach(app, "map")

        // The filter lists the whole folder tree; turning a folder off hides its pins.
        app.buttons["Filter"].tap()
        let seoul = app.collectionViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Seoul")).firstMatch
        XCTAssertTrue(seoul.waitForExistence(timeout: 3), "Filter lists the folders")
        XCTAssertEqual(seoul.value as? String, "On")
        seoul.tap()
        XCTAssertEqual(seoul.value as? String, "Off")
        attach(app, "filter")
        app.buttons["Show All"].tap()
        XCTAssertEqual(seoul.value as? String, "On")
        app.buttons["Done"].firstMatch.tap()

        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("Tower")
        let saved = button(app, startingWith: "N Seoul Tower")
        XCTAssertTrue(saved.waitForExistence(timeout: 5), "Saved places should be suggested")
        attach(app, "search")
        saved.tap()

        XCTAssertTrue(app.buttons["Directions"].waitForExistence(timeout: 5), "Selecting a place shows its card")
        XCTAssertTrue(app.staticTexts["서울 용산구 남산공원길 105"].waitForExistence(timeout: 3))
        attach(app, "card")

        app.buttons["Edit"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Edit Place"].waitForExistence(timeout: 3))
        attach(app, "editor")
        app.buttons["Cancel"].tap()

        app.buttons["Favorites"].tap()
        let cafes = app.collectionViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cafés")).firstMatch
        XCTAssertTrue(cafes.waitForExistence(timeout: 3), "Favorites lists the top-level folders")
        attach(app, "favorites")
        cafes.tap()
        XCTAssertTrue(button(app, startingWith: "Hongdae Coffee").waitForExistence(timeout: 3), "A folder lists its places")

        // Nest a new folder inside Cafés.
        let roasteries = app.collectionViews.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Roasteries'"))
        let before = roasteries.count
        app.buttons["More"].tap()
        app.buttons["New Folder"].tap()
        app.textFields["Name"].typeText("Roasteries")
        app.buttons["Create"].tap()
        XCTAssertTrue(button(app, startingWith: "Roasteries").waitForExistence(timeout: 3))
        XCTAssertEqual(roasteries.count, before + 1, "Create should add exactly one folder")
        attach(app, "folder")

        // Color the folder; its pins follow.
        app.buttons["More"].tap()
        app.buttons["Folder Color…"].tap()
        app.buttons["Green"].tap()
        XCTAssertTrue(app.buttons["Green"].isSelected)
        attach(app, "color")
        app.buttons["Done"].firstMatch.tap()
    }

    /// Rows and chips read as one element, e.g. "Seoul, 3" or "N Seoul Tower, 서울 용산구 …".
    private func button(_ app: XCUIApplication, startingWith title: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    }

    @MainActor
    private func attach(_ app: XCUIApplication, _ name: String) {
        Thread.sleep(forTimeInterval: 1.0)  // let the map settle
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
