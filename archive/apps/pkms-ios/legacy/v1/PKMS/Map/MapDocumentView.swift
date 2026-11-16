import MapKit
import SwiftUI

/// Shows a `*.map` folder as places on a map: your location, search, routes and editing the saved places.
struct MapDocumentView: View {
    let path: VaultPath

    @Environment(VaultStore.self) private var store
    @State private var model: MapDocumentModel?
    @State private var location = LocationAccess()
    @State private var search = PlaceSearch()
    @State private var query = ""
    @State private var isSearchPresented = false
    @State private var hiddenFolders: Set<Int> = []
    @State private var selection: MapItemID?
    @State private var camera: MapCameraPosition = .automatic
    @State private var didFitCamera = false
    @State private var droppedPin: CLLocationCoordinate2D?
    @State private var route: RouteState?
    @State private var travelMode: TravelMode = .driving
    @State private var draft: PlaceDraft?
    @State private var showsFavorites = false
    @State private var showsFilter = false
    @State private var pendingDelete: MapPlace?
    @State private var note: String?

    var body: some View {
        Group {
            if let model, let document = model.document {
                content(model, document)
            } else if let error = model?.loadError {
                ContentUnavailableView("Couldn’t Open Map", systemImage: "exclamationmark.triangle",
                                       description: Text(error))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(path.baseName)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: store.revision) {
            if model == nil { model = MapDocumentModel(path: path, store: store) }
            await model?.load()
            if !didFitCamera, let document = model?.document { fitCamera(to: document) }
        }
        .onAppear {
            location.start()
            hiddenFolders = Set(UserDefaults.standard.array(forKey: hiddenFoldersKey) as? [Int] ?? [])
        }
        .onChange(of: hiddenFolders) { _, new in
            UserDefaults.standard.set(new.sorted(), forKey: hiddenFoldersKey)
        }
        .onDisappear { location.stop() }
    }

    // MARK: - Layout

    private func content(_ model: MapDocumentModel, _ document: MapDocument) -> some View {
        mapView(model, document)
            .searchable(text: $query, isPresented: $isSearchPresented, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search places")
            .searchSuggestions { suggestions(document) }
            .onSubmit(of: .search) { Task { await runSearch { await search.run(query) } } }
            .onChange(of: query) { _, new in
                search.update(query: new)
                if new.isEmpty { clearSearch() }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { SyncStatusIcon() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add Place Here", systemImage: "mappin.and.ellipse") { dropPinAtCenter() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Filter", systemImage: hiddenFolders.isEmpty
                           ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill") {
                        showsFilter = true
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Favorites", systemImage: "star") { showsFavorites = true }
                }
            }
            .sheet(item: $draft) { draft in
                PlaceEditor(draft: draft, model: model) { saved in
                    if let saved { focus(on: saved) }
                }
            }
            .sheet(isPresented: $showsFilter) {
                FolderFilterView(model: model, hiddenFolders: $hiddenFolders)
            }
            .sheet(isPresented: $showsFavorites) {
                FavoritesView(model: model, userLocation: location.location, hiddenFolders: $hiddenFolders) { place in
                    showsFavorites = false
                    focus(on: place)
                } edit: { place in
                    // Present after the Favorites sheet has finished closing.
                    Task {
                        try? await Task.sleep(for: .milliseconds(600))
                        draft = PlaceDraft(place)
                    }
                }
            }
            .confirmationDialog(pendingDelete.map { "Delete “\($0.name)”?" } ?? "", isPresented: Binding {
                pendingDelete != nil
            } set: { if !$0 { pendingDelete = nil } }, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let place = pendingDelete {
                        model.deletePlace(place.id)
                        if selection == .saved(place.id) { selection = nil }
                    }
                }
            }
            .alert("Couldn’t Save", isPresented: Binding { model.saveError != nil } set: { if !$0 { model.saveError = nil } }) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(model.saveError ?? "")
            }
            .onChange(of: selection) { _, new in
                if route?.target != target(for: new, in: document) { route = nil }
                if new != .pin { droppedPin = nil }
            }
    }

    private func mapView(_ model: MapDocumentModel, _ document: MapDocument) -> some View {
        let visible = document.places.filter { !isHidden($0.folderID, in: document) }
        let shown = MapDeclutter.shownIDs(visible, region: visibleRegion, keeping: selectedSavedID)
        let showsNames = (visibleRegion?.span.latitudeDelta ?? 1) <= MapDeclutter.pinSpan
        return MapReader { proxy in
            // No rotate gesture, like Kakao Map: pinching only zooms, so north stays up.
            Map(position: $camera, interactionModes: [.pan, .zoom, .pitch], selection: $selection) {
                UserAnnotation()
                ForEach(visible) { place in
                    Annotation(place.name, coordinate: place.coordinate, anchor: .center) {
                        PlacePin(
                            name: place.name,
                            color: color(for: place.folderID, in: document),
                            isShown: shown.contains(place.id),
                            isSelected: selectedSavedID == place.id,
                            showsName: showsNames
                        )
                    }
                    .annotationTitles(.hidden)
                    .tag(MapItemID.saved(place.id))
                }
                ForEach(Array(search.results.enumerated()), id: \.offset) { i, item in
                    Marker(item: item).tag(MapItemID.result(i))
                }
                if let droppedPin {
                    Marker("Dropped Pin", systemImage: "mappin", coordinate: droppedPin)
                        .tint(.gray)
                        .tag(MapItemID.pin)
                }
                if let polyline = route?.route?.polyline {
                    MapPolyline(polyline).stroke(.blue, lineWidth: 6)
                }
            }
            .mapControls {
                MapUserLocationButton()
                MapPitchToggle()
                MapScaleView()
            }
            .onMapCameraChange(frequency: .onEnd) { context in
                search.region = context.region
                visibleRegion = context.region
            }
            // Long-press anywhere to drop a pin, like Apple Maps.
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.45)
                    .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .local))
                    .onEnded { value in
                        guard case .second(true, let drag?) = value,
                              let coordinate = proxy.convert(drag.location, from: .local) else { return }
                        dropPin(at: coordinate)
                    }
            )
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomPanel(model, document) }
    }

    @State private var visibleRegion: MKCoordinateRegion?

    private var selectedSavedID: Int? {
        if case .saved(let id) = selection { id } else { nil }
    }


    // MARK: - Search

    @ViewBuilder
    private func suggestions(_ document: MapDocument) -> some View {
        let saved = query.isEmpty ? [] : document.places.filter {
            $0.name.localizedStandardContains(query) || ($0.address?.localizedStandardContains(query) ?? false)
                || ($0.memo?.localizedStandardContains(query) ?? false)
        }
        if !saved.isEmpty {
            Section("Saved") {
                ForEach(saved.prefix(5)) { place in
                    Button { focus(on: place) } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(place.name).foregroundStyle(.primary)
                                if let address = place.address {
                                    Text(address).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        } icon: {
                            Image(systemName: "star.fill").foregroundStyle(color(for: place.folderID, in: document))
                        }
                    }
                }
            }
        }
        if !search.suggestions.isEmpty {
            Section("Places") {
                ForEach(search.suggestions, id: \.self) { completion in
                    Button {
                        query = completion.title
                        Task { await runSearch { await search.run(completion) } }
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(completion.title).foregroundStyle(.primary)
                                if !completion.subtitle.isEmpty {
                                    Text(completion.subtitle).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        } icon: {
                            Image(systemName: "magnifyingglass")
                        }
                    }
                }
            }
        }
    }

    private func runSearch(_ work: () async -> Void) async {
        selection = nil
        await work()
        isSearchPresented = false
        if search.results.count == 1 {
            selection = .result(0)
        }
        fit(search.results.map(\.placemark.coordinate))
    }

    private func clearSearch() {
        search.clear()
        if case .result = selection { selection = nil }
    }

    // MARK: - Bottom panel

    @ViewBuilder
    private func bottomPanel(_ model: MapDocumentModel, _ document: MapDocument) -> some View {
        if let target = target(for: selection, in: document) {
            PlaceCard(
                target: target,
                saved: savedPlace(for: selection, in: model, document: document),
                folderTitle: savedPlace(for: selection, in: model, document: document).map { document.pathTitle(of: $0.folderID) },
                distance: location.location.map { $0.distance(from: CLLocation(latitude: target.coordinate.latitude, longitude: target.coordinate.longitude)) },
                note: note,
                route: route?.target == target ? route : nil,
                travelMode: $travelMode,
                onClose: { selection = nil },
                onDirections: { Task { await showRoute(to: target) } },
                onClearRoute: { route = nil },
                onNavigate: { app in app.open(to: target, from: nil, mode: travelMode) },
                onSave: {
                    if let place = savedPlace(for: selection, in: model, document: document) {
                        draft = PlaceDraft(place)
                    } else {
                        draft = PlaceDraft(target: target, folderID: defaultFolder(in: document))
                    }
                },
                onDelete: { pendingDelete = savedPlace(for: selection, in: model, document: document) }
            )
            .onChange(of: travelMode) { _, _ in
                if route?.target == target { Task { await showRoute(to: target) } }
            }
            .task(id: selection) {
                note = nil
                if let place = savedPlace(for: selection, in: model, document: document) {
                    note = await model.note(for: place.id)
                }
            }
        } else if let error = search.error, !query.isEmpty, !search.isSearching {
            Text(error)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(12)
                .background(.regularMaterial, in: .capsule)
                .padding(.bottom, 8)
        } else if location.isDenied {
            Button("Turn on Location in Settings", systemImage: "location.slash") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            .font(.subheadline)
            .padding(12)
            .background(.regularMaterial, in: .capsule)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Routes

    private func showRoute(to target: MapTarget) async {
        route = RouteState(target: target, mode: travelMode, isLoading: true)
        let request = MKDirections.Request()
        request.source = .forCurrentLocation()
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: target.coordinate))
        request.transportType = travelMode.transportType
        let mode = travelMode
        do {
            let response = try await MKDirections(request: request).calculate()
            guard route?.target == target, travelMode == mode else { return }
            let best = response.routes.min { $0.expectedTravelTime < $1.expectedTravelTime }
            route = RouteState(target: target, mode: mode, route: best)
            if let best { camera = .rect(best.polyline.boundingMapRect.insetBy(dx: -best.polyline.boundingMapRect.width * 0.25, dy: -best.polyline.boundingMapRect.height * 0.4)) }
        } catch {
            guard route?.target == target else { return }
            let message = location.isDenied
                ? "Location is off, so a route can’t start from here."
                : "Apple Maps has no \(mode.title.lowercased()) route here. Open it in another app below."
            route = RouteState(target: target, mode: mode, error: message)
        }
    }

    // MARK: - Helpers

    private func target(for id: MapItemID?, in document: MapDocument) -> MapTarget? {
        switch id {
        case .saved(let placeID):
            guard let place = document.places.first(where: { $0.id == placeID }) else { return nil }
            return MapTarget(name: place.name, address: place.address, coordinate: place.coordinate)
        case .result(let i):
            guard search.results.indices.contains(i) else { return nil }
            let item = search.results[i]
            return MapTarget(name: item.name ?? "Place", address: item.shortAddress, coordinate: item.placemark.coordinate)
        case .pin:
            guard let droppedPin else { return nil }
            return MapTarget(name: "Dropped Pin", address: nil, coordinate: droppedPin)
        case nil:
            return nil
        }
    }

    /// The favorite behind the selection: the saved place itself, or one already saved at a search result's spot.
    private func savedPlace(for id: MapItemID?, in model: MapDocumentModel, document: MapDocument) -> MapPlace? {
        switch id {
        case .saved(let placeID): document.places.first { $0.id == placeID }
        case .result(let i) where search.results.indices.contains(i):
            model.savedPlace(near: search.results[i].placemark.coordinate, named: search.results[i].name)
        default: nil
        }
    }

    private func focus(on place: MapPlace) {
        query = ""
        isSearchPresented = false
        hiddenFolders.remove(place.folderID)
        withAnimation {
            camera = .region(MKCoordinateRegion(center: place.coordinate, latitudinalMeters: 700, longitudinalMeters: 700))
        }
        // Select once the search overlay or sheet is gone; otherwise the map treats the closing tap as
        // a tap on empty map and clears the selection right away.
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            selection = .saved(place.id)
        }
    }

    /// Frames every saved place once, then leaves the camera alone. An `.automatic` camera keeps
    /// re-fitting to the pins on screen, which fights the clustering (pins change with the zoom) and never settles.
    private func fitCamera(to document: MapDocument) {
        didFitCamera = true
        guard !document.places.isEmpty else { return }
        let rect = document.places.reduce(MKMapRect.null) { rect, place in
            let point = MKMapPoint(place.coordinate)
            return rect.union(MKMapRect(x: point.x, y: point.y, width: 0, height: 0))
        }
        camera = .rect(rect.insetBy(dx: -rect.width * 0.1 - 2000, dy: -rect.height * 0.1 - 2000))
    }

    private func dropPin(at coordinate: CLLocationCoordinate2D) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        droppedPin = coordinate
        selection = .pin
    }

    private func dropPinAtCenter() {
        guard let center = visibleRegion?.center ?? location.location?.coordinate else { return }
        dropPin(at: center)
    }

    private func fit(_ coordinates: [CLLocationCoordinate2D]) {
        guard !coordinates.isEmpty else { return }
        if coordinates.count == 1 {
            withAnimation { camera = .region(MKCoordinateRegion(center: coordinates[0], latitudinalMeters: 900, longitudinalMeters: 900)) }
            return
        }
        let rect = coordinates.map { MKMapRect(origin: MKMapPoint($0), size: MKMapSize(width: 1, height: 1)) }
            .reduce(MKMapRect.null) { $0.union($1) }
        withAnimation { camera = .rect(rect.insetBy(dx: -rect.width * 0.2 - 500, dy: -rect.height * 0.3 - 500)) }
    }

    private func defaultFolder(in document: MapDocument) -> Int {
        document.folders.max { document.places(in: $0.id).count < document.places(in: $1.id).count }?.id
            ?? document.folders.first?.id ?? 0
    }

    private func color(for folderID: Int, in document: MapDocument) -> Color {
        MapPalette.color(for: folderID, in: document)
    }

    /// Each folder is turned on or off on its own; the filter turns a whole subtree at once.
    private func isHidden(_ folderID: Int, in document: MapDocument) -> Bool {
        hiddenFolders.contains(folderID)
    }

    /// The filter is remembered per map on this device.
    private var hiddenFoldersKey: String { "map.hiddenFolders.\(path.string)" }}

enum MapItemID: Hashable {
    case saved(Int)
    case result(Int)
    case pin
}

struct RouteState {
    var target: MapTarget
    var mode: TravelMode
    var isLoading = false
    var route: MKRoute?
    var error: String?
}

/// Folder colors, stored by name in `folders.json` so the file stays readable.
enum MapPalette {
    static let names = ["red", "orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink", "brown", "gray"]
    /// Used, in order, for top-level folders that have no color of their own.
    private static let automatic = ["red", "blue", "green", "orange", "purple", "teal", "pink", "indigo", "brown", "mint"]

    static func color(named name: String) -> Color {
        switch name {
        case "red": .red
        case "orange": .orange
        case "yellow": .yellow
        case "green": .green
        case "mint": .mint
        case "teal": .teal
        case "cyan": .cyan
        case "blue": .blue
        case "indigo": .indigo
        case "purple": .purple
        case "pink": .pink
        case "brown": .brown
        default: .gray
        }
    }

    /// The folder's own color, else the nearest parent's, else an automatic one for its top-level folder.
    static func colorName(for folderID: Int, in document: MapDocument) -> String {
        let chain = document.ancestry(of: folderID)
        if let named = chain.reversed().lazy.compactMap(\.color).first(where: names.contains) { return named }
        let top = chain.first?.id ?? folderID
        let index = document.children(of: nil).firstIndex { $0.id == top } ?? 0
        return automatic[index % automatic.count]
    }

    static func color(for folderID: Int, in document: MapDocument) -> Color {
        color(named: colorName(for: folderID, in: document))
    }
}

/// Details and actions for whatever is selected on the map.
private struct PlaceCard: View {
    let target: MapTarget
    let saved: MapPlace?
    let folderTitle: String?
    let distance: CLLocationDistance?
    /// Optional research note (`notes/<id>.md`) for a saved place.
    let note: String?
    let route: RouteState?
    @Binding var travelMode: TravelMode
    @State private var showsNote = false
    let onClose: () -> Void
    let onDirections: () -> Void
    let onClearRoute: () -> Void
    let onNavigate: (NavigationApp) -> Void
    let onSave: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(saved?.name ?? target.name).font(.headline)
                Spacer()
                Button("Close", systemImage: "xmark.circle.fill", action: onClose)
                    .labelStyle(.iconOnly)
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            if let address = saved?.address ?? target.address {
                Text(address).font(.subheadline).foregroundStyle(.secondary)
            }
            if let memo = saved?.memo {
                Text(memo).font(.subheadline)
            }
            if note != nil {
                Button("Notes", systemImage: "doc.text") { showsNote = true }
                    .font(.subheadline)
            }
            HStack(spacing: 12) {
                if let folderTitle {
                    Label(folderTitle, systemImage: "star.fill")
                }
                if let distance {
                    Label(distance.distanceText, systemImage: "location")
                }
                if saved?.estimated == true {
                    Label("Approximate", systemImage: "scope")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let route {
                routeSection(route)
            } else {
                actions
            }
        }
        .padding(14)
        .background(.regularMaterial, in: .rect(cornerRadius: 16))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .sheet(isPresented: $showsNote) {
            if let note {
                NavigationStack {
                    ScrollView {
                        MarkdownView(blocks: MarkdownParser.parse(note).blocks)
                            .padding(.horizontal, 20)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                        .navigationTitle(saved?.name ?? target.name)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { showsNote = false }
                            }
                        }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button(action: onDirections) {
                Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Button(action: onSave) {
                Label(saved == nil ? "Save" : "Edit", systemImage: saved == nil ? "star" : "pencil")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            if saved != nil {
                Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
                    .labelStyle(.iconOnly)
                    .buttonStyle(.bordered)
            }
        }
        .controlSize(.regular)
    }

    private func routeSection(_ route: RouteState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Travel", selection: $travelMode) {
                ForEach(TravelMode.allCases) { mode in
                    Label(mode.title, systemImage: mode.symbol).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            Group {
                if route.isLoading {
                    HStack { ProgressView(); Text("Finding a route…") }
                } else if let best = route.route {
                    HStack(alignment: .firstTextBaseline) {
                        Text(best.expectedTravelTime.travelTimeText).font(.title3.weight(.semibold))
                        Text(best.distance.distanceText).foregroundStyle(.secondary)
                    }
                } else if let error = route.error {
                    Text(error).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .frame(minHeight: 28)

            HStack(spacing: 8) {
                Menu {
                    ForEach(NavigationApp.allCases) { app in
                        Button(app.title) { onNavigate(app) }
                    }
                } label: {
                    Label("Navigate", systemImage: "location.north.line.fill")
                        .frame(maxWidth: .infinity)
                } primaryAction: {
                    onNavigate(.kakao)
                }
                .buttonStyle(.borderedProminent)
                Button("End Route", systemImage: "xmark", action: onClearRoute)
                    .buttonStyle(.bordered)
            }
        }
    }
}

/// A saved place's pin. Pins fade and shrink away instead of popping out when `MapDeclutter` drops them.
struct PlacePin: View {
    let name: String
    let color: Color
    let isShown: Bool
    let isSelected: Bool
    let showsName: Bool

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: "star.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(color.gradient, in: .circle)
                .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                .shadow(radius: 2, y: 1)
                .scaleEffect(isSelected ? 1.3 : 1)
            if showsName || isSelected {
                Text(name)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 4)
                    .background(.background.opacity(0.75), in: .capsule)
                    .frame(maxWidth: 110)
            }
        }
        .opacity(isShown ? 1 : 0)
        .scaleEffect(isShown ? 1 : 0.4)
        .animation(.easeInOut(duration: 0.25), value: isShown)
        .allowsHitTesting(isShown)
    }
}
