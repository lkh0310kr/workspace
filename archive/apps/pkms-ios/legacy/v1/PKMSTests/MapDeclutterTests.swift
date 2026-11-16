import MapKit
import Testing
@testable import PKMS

struct MapDeclutterTests {
    private func place(_ id: Int, _ lat: Double, _ lon: Double) -> MapPlace {
        MapPlace(id: id, name: "P\(id)", lat: lat, lon: lon, createdAt: "")
    }

    private func region(span: Double) -> MKCoordinateRegion {
        MKCoordinateRegion(center: .init(latitude: 37.5, longitude: 127.0),
                           span: .init(latitudeDelta: span, longitudeDelta: span))
    }

    /// A 20 × 20 block of places about 100 m apart.
    private var crowd: [MapPlace] {
        (0..<400).map { place($0, 37.5 + Double($0 / 20) * 0.001, 127.0 + Double($0 % 20) * 0.001) }
    }

    @Test func zoomedOutOnlyASpreadOutSampleIsShown() {
        let shown = MapDeclutter.shownIDs(crowd, region: region(span: 2), keeping: nil)
        #expect(shown.count >= 1 && shown.count < 20)
    }

    @Test func zoomingInOnlyAddsPins() {
        let far = MapDeclutter.shownIDs(crowd, region: region(span: 1), keeping: nil)
        let near = MapDeclutter.shownIDs(crowd, region: region(span: 0.1), keeping: nil)
        #expect(far.isSubset(of: near))
        #expect(near.count > far.count)
    }

    @Test func fullyZoomedInEveryPlaceIsShown() {
        #expect(MapDeclutter.shownIDs(crowd, region: region(span: 0.005), keeping: nil).count == 400)
    }

    @Test func shownPlacesNeverOverlap() {
        let span = 0.5
        let shown = MapDeclutter.shownIDs(crowd, region: region(span: span), keeping: nil)
        let size = span / 22
        let kept = crowd.filter { shown.contains($0.id) }
        for (i, a) in kept.enumerated() {
            for b in kept[(i + 1)...] {
                #expect(abs(a.lat - b.lat) >= size * 0.999 || abs(a.lon - b.lon) >= size * 0.999 / cos(37.5 * .pi / 180))
            }
        }
    }

    @Test func selectedPlaceIsAlwaysShown() {
        let shown = MapDeclutter.shownIDs(crowd, region: region(span: 2), keeping: 123)
        #expect(shown.contains(123))
    }

    @Test func withoutARegionEverythingIsShown() {
        #expect(MapDeclutter.shownIDs(crowd, region: nil, keeping: nil).count == 400)
    }
}
