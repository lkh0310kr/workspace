import MapKit

/// Picks which saved places get a pin at the current zoom, like Kakao Map: zoomed out only
/// a spread-out sample of pins is shown, and more appear as you zoom in until every place has one.
///
/// Pins are taken in a fixed pseudo-random order and kept only if no already-kept pin is within
/// about one pin's width on screen. The order never changes, so a pin that is visible stays visible
/// while you pan or zoom further in, and the set only grows as you zoom in.
enum MapDeclutter {
    /// How many pin-sized cells fit across the screen's height.
    private static let cellsAcross = 22.0
    /// Below this latitude span (about 1.3 km) every place gets its own pin.
    static let pinSpan = 0.012

    static func shownIDs(_ places: [MapPlace], region: MKCoordinateRegion?, keeping selected: Int?) -> Set<Int> {
        guard let region, region.span.latitudeDelta > pinSpan else { return Set(places.map(\.id)) }

        let latSize = region.span.latitudeDelta / cellsAcross
        let lonSize = latSize / max(cos(region.center.latitude * .pi / 180), 0.2)
        func cell(_ place: MapPlace) -> (Int, Int) {
            (Int((place.lat / latSize).rounded(.down)), Int((place.lon / lonSize).rounded(.down)))
        }

        var grid: [[Int]: [MapPlace]] = [:]
        var shown: Set<Int> = []
        func keep(_ place: MapPlace) {
            let (i, j) = cell(place)
            grid[[i, j], default: []].append(place)
            shown.insert(place.id)
        }

        if let selected, let place = places.first(where: { $0.id == selected }) { keep(place) }
        for place in places.sorted(by: priority) where !shown.contains(place.id) {
            let (i, j) = cell(place)
            let crowded = (i - 1...i + 1).contains { di in
                (j - 1...j + 1).contains { dj in
                    grid[[di, dj]]?.contains {
                        abs($0.lat - place.lat) < latSize && abs($0.lon - place.lon) < lonSize
                    } ?? false
                }
            }
            if !crowded { keep(place) }
        }
        return shown
    }

    /// A stable, evenly spread order that doesn't depend on where the user is looking.
    private static func priority(_ a: MapPlace, _ b: MapPlace) -> Bool {
        let (x, y) = (rank(a.id), rank(b.id))
        return x == y ? a.id < b.id : x < y
    }

    private static func rank(_ id: Int) -> UInt64 {
        UInt64(bitPattern: Int64(id)) &* 0x9E37_79B9_7F4A_7C15
    }
}
