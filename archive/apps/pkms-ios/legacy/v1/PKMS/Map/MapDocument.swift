import CoreLocation
import Foundation
import Observation
import SwiftUI

/// A `*.map` folder in the vault: `folders.json` lists the favorite folders (nested through `parent`),
/// and `<folder id>.json` holds each folder's own places. Plain JSON files, so it syncs through Git like any note.
struct MapDocument: Sendable {
    var folders: [MapFolder]
    var places: [MapPlace]

    func places(in folderID: Int) -> [MapPlace] {
        places.filter { $0.folderID == folderID }
    }

    func folder(_ id: Int) -> MapFolder? {
        folders.first { $0.id == id }
    }

    // MARK: - Hierarchy

    /// Folders directly inside `parent`, or the top-level folders for `nil`, in their saved order.
    func children(of parent: Int?) -> [MapFolder] {
        folders.filter { $0.parentID == parent }
    }

    /// `id` and every folder nested under it.
    func subtree(of id: Int) -> Set<Int> {
        var result: Set<Int> = [id]
        var queue = [id]
        while let next = queue.popLast() {
            for child in children(of: next) where result.insert(child.id).inserted {
                queue.append(child.id)
            }
        }
        return result
    }

    /// Folders from the top level down to `id`.
    func ancestry(of id: Int) -> [MapFolder] {
        var chain: [MapFolder] = []
        var current = folder(id)
        while let folder = current, !chain.contains(where: { $0.id == folder.id }) {
            chain.insert(folder, at: 0)
            current = folder.parentID.flatMap(self.folder)
        }
        return chain
    }

    /// "서울 / 카페" for a nested folder.
    func pathTitle(of id: Int) -> String {
        ancestry(of: id).map(\.title).joined(separator: " / ")
    }

    /// Places in the folder and everything nested under it.
    func placeCount(under id: Int) -> Int {
        let ids = subtree(of: id)
        return places.filter { ids.contains($0.folderID) }.count
    }

    /// Every folder in display order with its nesting depth, for pickers.
    func outline(excluding excluded: Set<Int> = []) -> [(folder: MapFolder, depth: Int)] {
        var result: [(MapFolder, Int)] = []
        func visit(_ parent: Int?, _ depth: Int) {
            for child in children(of: parent) where !excluded.contains(child.id) {
                result.append((child, depth))
                visit(child.id, depth + 1)
            }
        }
        visit(nil, 0)
        // Folders whose parent is missing (e.g. deleted on another device) still show, at the top level.
        let shown = Set(result.map(\.0.id))
        for folder in folders where !shown.contains(folder.id) && !excluded.contains(folder.id) {
            result.append((folder, 0))
        }
        return result
    }

    // MARK: - Visibility

    /// Whether a folder's pins show on the map: all of its subtree, none of it, or some.
    enum Visibility { case shown, hidden, mixed }

    /// `hidden` holds each folder whose own places are turned off.
    func visibility(of id: Int, hidden: Set<Int>) -> Visibility {
        let ids = subtree(of: id)
        let off = ids.intersection(hidden).count
        return off == 0 ? .shown : off == ids.count ? .hidden : .mixed
    }

    /// Turns a fully shown folder off with everything in it; otherwise turns it all back on.
    func toggleVisibility(of id: Int, in hidden: inout Set<Int>) {
        let ids = subtree(of: id)
        if visibility(of: id, hidden: hidden) == .shown { hidden.formUnion(ids) } else { hidden.subtract(ids) }
    }

    static func load(_ path: VaultPath, from repository: any VaultRepository) async throws -> MapDocument {
        struct Index: Decodable { var folders: [MapFolder] }
        let decoder = JSONDecoder()
        let index = try decoder.decode(Index.self, from: try await repository.readData(at: path.appending("folders.json")))
        var places: [MapPlace] = []
        for folder in index.folders where repository.exists(path.appending(fileName(for: folder.id))) {
            let data = try await repository.readData(at: path.appending(fileName(for: folder.id)))
            var items = try decoder.decode([MapPlace].self, from: data)
            for i in items.indices { items[i].folderID = folder.id }
            places += items
        }
        return MapDocument(folders: index.folders, places: places)
    }

    static func fileName(for folderID: Int) -> String { "\(folderID).json" }

    /// Optional research note for a place or folder, kept beside the JSON so the app's rewrites never drop it.
    static func noteFileName(for id: Int) -> String { "notes/\(id).md" }

    /// `folders.json`, with each folder's `count` kept in step with its places.
    func indexJSON() throws -> String {
        struct Index: Encodable { var version = 1; var folders: [MapFolder] }
        let folders = folders.map { folder in
            var folder = folder
            folder.count = places(in: folder.id).count
            return folder
        }
        return try Self.encode(Index(folders: folders))
    }

    func placesJSON(for folderID: Int) throws -> String {
        try Self.encode(places(in: folderID))
    }

    private static func encode(_ value: some Encodable) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return String(decoding: try encoder.encode(value), as: UTF8.self) + "\n"
    }
}

struct MapFolder: Codable, Identifiable, Hashable, Sendable {
    var id: Int
    var title: String
    var memo: String?
    var icon: String
    /// Places directly in this folder (not counting subfolders).
    var count: Int
    /// Containing folder; `nil` for a top-level folder.
    var parentID: Int?
    /// A `MapPalette` color name. `nil` uses the parent folder's color (or an automatic one at the top level).
    var color: String?

    private enum CodingKeys: String, CodingKey {
        case id, title, memo, icon, count, color
        case parentID = "parent"
    }
}

struct MapPlace: Codable, Identifiable, Hashable, Sendable {
    var id: Int
    var name: String
    var address: String?
    var memo: String?
    var lat: Double
    var lon: Double
    var createdAt: String
    /// Set when the position was derived from Kakao's own x/y coordinates (accurate to a few meters).
    var estimated: Bool?
    var kakaoPlaceId: String?
    /// Group this place belongs to; filled in by `MapDocument.load`, not stored in the file.
    var folderID = 0

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    private enum CodingKeys: String, CodingKey {
        case id, name, address, memo, lat, lon, createdAt, estimated, kakaoPlaceId
    }
}

/// The open map and its edits. Every change is written straight back into the `*.map` folder,
/// which schedules a sync like any other edit.
@MainActor
@Observable
final class MapDocumentModel {
    let path: VaultPath
    private(set) var document: MapDocument?
    private(set) var loadError: String?
    var saveError: String?

    @ObservationIgnored private let store: VaultStore

    init(path: VaultPath, store: VaultStore) {
        self.path = path
        self.store = store
    }

    func load() async {
        do {
            document = try await MapDocument.load(path, from: store.repository)
            loadError = nil
        } catch {
            // Keep showing what was loaded before if a sync briefly leaves the files mid-update.
            if document == nil { loadError = error.localizedDescription }
        }
    }

    // MARK: - Places

    @discardableResult
    func addPlace(name: String, address: String?, memo: String?, coordinate: CLLocationCoordinate2D,
                  folderID: Int) -> MapPlace? {
        guard var document else { return nil }
        let place = MapPlace(
            id: newID(), name: name, address: address.nilIfBlank, memo: memo.nilIfBlank,
            lat: coordinate.latitude, lon: coordinate.longitude,
            createdAt: Self.timestamp(), folderID: folderID
        )
        document.places.append(place)
        commit(document, folders: [folderID])
        return place
    }

    func updatePlace(_ place: MapPlace) {
        guard var document, let i = document.places.firstIndex(where: { $0.id == place.id }) else { return }
        let oldFolder = document.places[i].folderID
        var place = place
        place.address = place.address.nilIfBlank
        place.memo = place.memo.nilIfBlank
        document.places[i] = place
        commit(document, folders: [oldFolder, place.folderID])
    }

    func deletePlace(_ id: Int) {
        guard var document, let i = document.places.firstIndex(where: { $0.id == id }) else { return }
        let folder = document.places.remove(at: i).folderID
        commit(document, folders: [folder])
        deleteNote(for: id)
    }

    /// The place's or folder's `notes/<id>.md`, if there is one.
    func note(for id: Int) async -> String? {
        let file = path.appending(MapDocument.noteFileName(for: id))
        guard store.repository.exists(file) else { return nil }
        return (try? await store.repository.readText(at: file)).nilIfBlank
    }

    private func deleteNote(for id: Int) {
        let file = path.appending(MapDocument.noteFileName(for: id))
        if store.repository.exists(file) { try? store.repository.delete(file) }
    }

    /// Whether a place at this spot is already saved, so search results can show it as saved.
    func savedPlace(near coordinate: CLLocationCoordinate2D, named name: String?) -> MapPlace? {
        document?.places.first { place in
            abs(place.lat - coordinate.latitude) < 0.0002 && abs(place.lon - coordinate.longitude) < 0.0002
                && (name == nil || place.name == name)
        }
    }

    // MARK: - Folders

    @discardableResult
    func addFolder(title: String, in parent: Int? = nil) -> MapFolder? {
        guard var document else { return nil }
        let folder = MapFolder(id: newID(), title: title, icon: "01", count: 0, parentID: parent)
        document.folders.append(folder)
        commit(document, folders: [folder.id])
        return folder
    }

    /// Whether `id` can move into `parent`: never into itself or one of its own subfolders.
    func canMoveFolder(_ id: Int, to parent: Int?) -> Bool {
        guard let document else { return false }
        guard let parent else { return true }
        return !document.subtree(of: id).contains(parent)
    }

    func moveFolder(_ id: Int, to parent: Int?) {
        guard canMoveFolder(id, to: parent), var document,
              let i = document.folders.firstIndex(where: { $0.id == id }) else { return }
        // Moved folders go to the end of their new parent's list.
        var folder = document.folders.remove(at: i)
        folder.parentID = parent
        document.folders.append(folder)
        commit(document, folders: [])
    }

    /// Sets the folder's color; `nil` goes back to following its parent.
    func setFolderColor(_ id: Int, to color: String?) {
        guard var document, let i = document.folders.firstIndex(where: { $0.id == id }) else { return }
        document.folders[i].color = color
        commit(document, folders: [])
    }

    func renameFolder(_ id: Int, to title: String) {
        guard var document, let i = document.folders.firstIndex(where: { $0.id == id }) else { return }
        document.folders[i].title = title
        commit(document, folders: [])
    }

    /// Removes a folder with its subfolders and every place in them.
    func deleteFolder(_ id: Int) {
        guard var document else { return }
        let removed = document.subtree(of: id)
        let removedNotes = removed.union(document.places.filter { removed.contains($0.folderID) }.map(\.id))
        document.folders.removeAll { removed.contains($0.id) }
        document.places.removeAll { removed.contains($0.folderID) }
        self.document = document
        defer { removedNotes.forEach(deleteNote) }
        do {
            try store.save(try document.indexJSON(), to: path.appending("folders.json"))
            for id in removed {
                let file = path.appending(MapDocument.fileName(for: id))
                if store.repository.exists(file) { try store.repository.delete(file) }
            }
        } catch {
            saveError = error.localizedDescription
        }
    }

    /// Reorders the folders inside `parent`, leaving every other folder where it is.
    func moveFolders(in parent: Int?, from source: IndexSet, to destination: Int) {
        guard var document else { return }
        var siblings = document.children(of: parent)
        siblings.move(fromOffsets: source, toOffset: destination)
        var next = siblings.makeIterator()
        document.folders = document.folders.map { $0.parentID == parent ? next.next()! : $0 }
        commit(document, folders: [])
    }

    // MARK: - Saving

    private func commit(_ document: MapDocument, folders changed: Set<Int>) {
        self.document = document
        do {
            for id in changed where document.folder(id) != nil {
                try store.save(try document.placesJSON(for: id), to: path.appending(MapDocument.fileName(for: id)))
            }
            try store.save(try document.indexJSON(), to: path.appending("folders.json"))
        } catch {
            saveError = error.localizedDescription
        }
    }

    @ObservationIgnored private var lastID = 0

    /// Millisecond timestamps, bumped when two are made in the same millisecond or one is already taken.
    private func newID() -> Int {
        let taken = Set((document?.folders.map(\.id) ?? []) + (document?.places.map(\.id) ?? []))
        var id = max(Int(Date.now.timeIntervalSince1970 * 1000), lastID + 1)
        while taken.contains(id) { id += 1 }
        lastID = id
        return id
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: .now)
    }
}

extension Optional<String> {
    /// `nil` for missing or whitespace-only text, so empty fields aren't written to the file.
    var nilIfBlank: String? {
        guard let self, !self.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return self
    }
}
