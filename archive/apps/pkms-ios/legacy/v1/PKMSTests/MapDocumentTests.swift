import Foundation
import Testing
@testable import PKMS

struct MapDocumentTests {
    private func makeVault() throws -> LocalVaultRepository {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let repo = LocalVaultRepository(rootURL: root)
        try repo.writeText(#"{"version":1,"folders":[{"id":7,"title":"Seoul","icon":"01","count":1},{"id":0,"title":"Empty","icon":"01","count":0}]}"#,
                           to: VaultPath("places.map/folders.json"))
        try repo.writeText(#"[{"id":1,"name":"Cafe","address":"Somewhere","lat":37.5,"lon":127.0,"color":"02","createdAt":"2026-01-01 00:00:00"}]"#,
                           to: VaultPath("places.map/7.json"))
        return repo
    }

    @Test func loadsFoldersAndPlaces() async throws {
        let repo = try makeVault()
        let document = try await MapDocument.load(VaultPath("places.map"), from: repo)
        #expect(document.folders.map(\.title) == ["Seoul", "Empty"])
        #expect(document.places.count == 1)
        #expect(document.places[0].folderID == 7)
        #expect(document.places[0].address == "Somewhere")
    }

    @Test func mapFolderIsOneBrowsableNode() async throws {
        let repo = try makeVault()
        let index = try await repo.loadIndex()
        let node = try #require(index.node(at: VaultPath("places.map")))
        #expect(node.kind == .map)
        #expect(node.isBrowsable)
        #expect(node.displayName == "places")
        #expect(node.children.isEmpty)
    }

    @MainActor @Test func editsAreWrittenBackToTheFolder() async throws {
        let repo = try makeVault()
        let store = VaultStore(repository: repo, defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let path = VaultPath("places.map")
        let model = MapDocumentModel(path: path, store: store)
        await model.load()

        let folder = try #require(model.addFolder(title: "Busan"))
        let added = try #require(model.addPlace(name: "Beach", address: " ", memo: "swim",
                                                coordinate: .init(latitude: 35.15, longitude: 129.16), folderID: folder.id))
        var moved = try #require(model.document?.places.first { $0.name == "Cafe" })
        moved.folderID = folder.id
        model.updatePlace(moved)
        model.renameFolder(7, to: "서울")

        let reloaded = try await MapDocument.load(path, from: repo)
        #expect(reloaded.folders.map(\.title) == ["서울", "Empty", "Busan"])
        #expect(Set(reloaded.places(in: folder.id).map(\.name)) == ["Beach", "Cafe"])
        #expect(reloaded.places(in: 7).isEmpty)
        #expect(reloaded.places.first { $0.id == added.id }?.address == nil)
        #expect(reloaded.places.first { $0.id == added.id }?.memo == "swim")
        let index = try await repo.readText(at: path.appending("folders.json"))
        #expect(index.contains("\"count\" : 2"))

        model.deleteFolder(folder.id)
        #expect(!repo.exists(path.appending("\(folder.id).json")))
        #expect(try await MapDocument.load(path, from: repo).places.isEmpty)
    }

    @MainActor @Test func placeNotesAreOptionalAndGoWithThePlace() async throws {
        let repo = try makeVault()
        let store = VaultStore(repository: repo, defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let path = VaultPath("places.map")
        let model = MapDocumentModel(path: path, store: store)
        await model.load()

        // Place 1 has no note; a blank file counts as none.
        #expect(await model.note(for: 1) == nil)
        try repo.writeText("  \n", to: path.appending(MapDocument.noteFileName(for: 1)))
        #expect(await model.note(for: 1) == nil)

        try repo.writeText("# Cafe\n- open late\n", to: path.appending(MapDocument.noteFileName(for: 1)))
        #expect(await model.note(for: 1) == "# Cafe\n- open late\n")

        // Saving the JSON through the app leaves the note alone; deleting the place removes it.
        model.renameFolder(7, to: "서울")
        #expect(repo.exists(path.appending("notes/1.md")))
        model.deletePlace(1)
        #expect(!repo.exists(path.appending("notes/1.md")))

        // Deleting a folder removes its own note and its places' notes.
        let other = try #require(model.addFolder(title: "Busan"))
        let place = try #require(model.addPlace(name: "Beach", address: nil, memo: nil,
                                                coordinate: .init(latitude: 35.15, longitude: 129.16), folderID: other.id))
        try repo.writeText("folder", to: path.appending(MapDocument.noteFileName(for: other.id)))
        try repo.writeText("place", to: path.appending(MapDocument.noteFileName(for: place.id)))
        model.deleteFolder(other.id)
        #expect(!repo.exists(path.appending(MapDocument.noteFileName(for: other.id))))
        #expect(!repo.exists(path.appending(MapDocument.noteFileName(for: place.id))))
    }

    @MainActor @Test func foldersNestAndMoveWithoutCycles() async throws {
        let repo = try makeVault()
        let store = VaultStore(repository: repo, defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let path = VaultPath("places.map")
        let model = MapDocumentModel(path: path, store: store)
        await model.load()

        let cafes = try #require(model.addFolder(title: "Cafés", in: 7))
        let roastery = try #require(model.addFolder(title: "Roasteries", in: cafes.id))
        model.addPlace(name: "Beans", address: nil, memo: nil, coordinate: .init(latitude: 37.5, longitude: 127), folderID: roastery.id)

        var document = try await MapDocument.load(path, from: repo)
        #expect(document.children(of: nil).map(\.title) == ["Seoul", "Empty"])
        #expect(document.children(of: 7).map(\.title) == ["Cafés"])
        #expect(document.pathTitle(of: roastery.id) == "Seoul / Cafés / Roasteries")
        #expect(document.placeCount(under: 7) == 2)
        #expect(document.outline().map(\.depth) == [0, 1, 2, 0])

        // A folder can't move into its own subfolder.
        #expect(!model.canMoveFolder(cafes.id, to: roastery.id))
        model.moveFolder(cafes.id, to: roastery.id)
        #expect(model.document?.folder(cafes.id)?.parentID == 7)

        model.moveFolder(roastery.id, to: nil)
        model.moveFolders(in: nil, from: [2], to: 0)
        document = try await MapDocument.load(path, from: repo)
        #expect(document.children(of: nil).map(\.title) == ["Roasteries", "Seoul", "Empty"])

        // Deleting a folder takes its subfolders and their places with it.
        model.moveFolder(roastery.id, to: cafes.id)
        model.deleteFolder(7)
        document = try await MapDocument.load(path, from: repo)
        #expect(document.folders.map(\.title) == ["Empty"])
        #expect(document.places.isEmpty)
        #expect(!repo.exists(path.appending("\(roastery.id).json")))
    }

    @Test func filterTurnsWholeSubtreesOnAndOff() {
        let document = MapDocument(folders: [
            MapFolder(id: 1, title: "대구", icon: "01", count: 0),
            MapFolder(id: 2, title: "음식점", icon: "01", count: 0, parentID: 1),
            MapFolder(id: 3, title: "서점", icon: "01", count: 0, parentID: 1),
            MapFolder(id: 4, title: "서울", icon: "01", count: 0),
        ], places: [])
        var hidden: Set<Int> = []

        document.toggleVisibility(of: 1, in: &hidden)
        #expect(hidden == [1, 2, 3])
        #expect(document.visibility(of: 1, hidden: hidden) == .hidden)

        // Turning one subfolder back on leaves the parent partly on.
        document.toggleVisibility(of: 2, in: &hidden)
        #expect(hidden == [1, 3])
        #expect(document.visibility(of: 1, hidden: hidden) == .mixed)
        #expect(document.visibility(of: 2, hidden: hidden) == .shown)

        // Tapping a partly-on folder turns all of it on.
        document.toggleVisibility(of: 1, in: &hidden)
        #expect(hidden.isEmpty)
        #expect(document.visibility(of: 4, hidden: hidden) == .shown)
    }

    @MainActor @Test func pinsTakeTheirFolderColor() async throws {
        let repo = try makeVault()
        let store = VaultStore(repository: repo, defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let path = VaultPath("places.map")
        let model = MapDocumentModel(path: path, store: store)
        await model.load()
        let child = try #require(model.addFolder(title: "Cafés", in: 7))
        let grandchild = try #require(model.addFolder(title: "Roasteries", in: child.id))

        // Without colors, nested folders follow their top-level folder's automatic color.
        var document = try #require(model.document)
        #expect(MapPalette.colorName(for: grandchild.id, in: document) == MapPalette.colorName(for: 7, in: document))

        model.setFolderColor(7, to: "purple")
        model.setFolderColor(child.id, to: "green")
        document = try await MapDocument.load(path, from: repo)
        #expect(MapPalette.colorName(for: 7, in: document) == "purple")
        #expect(MapPalette.colorName(for: grandchild.id, in: document) == "green")

        model.setFolderColor(child.id, to: nil)
        document = try await MapDocument.load(path, from: repo)
        #expect(MapPalette.colorName(for: grandchild.id, in: document) == "purple")
        // Places no longer carry a color of their own; the old field is dropped when the file is next written.
        model.addPlace(name: "Kiosk", address: nil, memo: nil, coordinate: .init(latitude: 37.5, longitude: 127), folderID: 7)
        #expect(!(try await repo.readText(at: path.appending("7.json"))).contains("color"))
        #expect(model.document?.places.count == 2)
    }
}
