import CoreLocation
import MapKit
import Observation
import UIKit

/// Asks for "while using" location access the first time the map wants the user's position.
@MainActor
@Observable
final class LocationAccess: NSObject, @preconcurrency CLLocationManagerDelegate {
    private(set) var status: CLAuthorizationStatus
    private(set) var location: CLLocation?
    @ObservationIgnored private let manager = CLLocationManager()

    override init() {
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    var isDenied: Bool { status == .denied || status == .restricted }

    func start() {
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.startUpdatingLocation()
    }

    func stop() { manager.stopUpdatingLocation() }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        status = manager.authorizationStatus
        if status == .authorizedWhenInUse || status == .authorizedAlways { manager.startUpdatingLocation() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.last
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

/// Type-ahead suggestions and full searches through Apple Maps, biased to what's on screen.
@MainActor
@Observable
final class PlaceSearch: NSObject, @preconcurrency MKLocalSearchCompleterDelegate {
    private(set) var suggestions: [MKLocalSearchCompletion] = []
    private(set) var results: [MKMapItem] = []
    private(set) var isSearching = false
    private(set) var error: String?
    @ObservationIgnored private let completer = MKLocalSearchCompleter()
    @ObservationIgnored private var search: MKLocalSearch?

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.pointOfInterest, .address]
    }

    var region: MKCoordinateRegion? {
        didSet { if let region { completer.region = region } }
    }

    func update(query: String) {
        let query = query.trimmingCharacters(in: .whitespaces)
        if query.isEmpty {
            suggestions = []
            completer.cancel()
        } else {
            completer.queryFragment = query
        }
    }

    func run(_ query: String) async {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        await run(request)
    }

    func run(_ completion: MKLocalSearchCompletion) async {
        await run(MKLocalSearch.Request(completion: completion))
    }

    func clear() {
        search?.cancel()
        results = []
        suggestions = []
        error = nil
    }

    private func run(_ request: MKLocalSearch.Request) async {
        if let region { request.region = region }
        search?.cancel()
        let search = MKLocalSearch(request: request)
        self.search = search
        isSearching = true
        defer { isSearching = false }
        do {
            results = try await search.start().mapItems
            error = results.isEmpty ? "No results" : nil
        } catch {
            results = []
            self.error = (error as? MKError)?.code == .placemarkNotFound ? "No results" : error.localizedDescription
        }
    }

    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        suggestions = Array(completer.results.prefix(8))
    }

    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        suggestions = []
    }
}

/// How to get somewhere, shown in the app or handed off to a navigation app.
enum TravelMode: String, CaseIterable, Identifiable {
    case driving, walking, transit

    var id: Self { self }

    var title: String {
        switch self {
        case .driving: "Drive"
        case .walking: "Walk"
        case .transit: "Transit"
        }
    }

    var symbol: String {
        switch self {
        case .driving: "car.fill"
        case .walking: "figure.walk"
        case .transit: "tram.fill"
        }
    }

    var transportType: MKDirectionsTransportType {
        switch self {
        case .driving: .automobile
        case .walking: .walking
        case .transit: .transit
        }
    }

    var appleMapsMode: String {
        switch self {
        case .driving: MKLaunchOptionsDirectionsModeDriving
        case .walking: MKLaunchOptionsDirectionsModeWalking
        case .transit: MKLaunchOptionsDirectionsModeTransit
        }
    }
}

/// A place the map is pointing at: a saved favorite, a search result or a dropped pin.
struct MapTarget: Equatable {
    var name: String
    var address: String?
    var coordinate: CLLocationCoordinate2D

    static func == (lhs: MapTarget, rhs: MapTarget) -> Bool {
        lhs.name == rhs.name && lhs.address == rhs.address
            && lhs.coordinate.latitude == rhs.coordinate.latitude && lhs.coordinate.longitude == rhs.coordinate.longitude
    }
}

/// Opening a route in another app. Kakao Map, Naver Map and TMAP know Korean roads and transit far better than Apple Maps.
enum NavigationApp: String, CaseIterable, Identifiable {
    case kakao, naver, tmap, apple

    var id: Self { self }

    var title: String {
        switch self {
        case .kakao: "Kakao Map"
        case .naver: "Naver Map"
        case .tmap: "TMAP"
        case .apple: "Apple Maps"
        }
    }

    /// Fills in the origin itself when `from` is nil (the device's current location).
    @MainActor
    func open(to target: MapTarget, from origin: CLLocationCoordinate2D?, mode: TravelMode) {
        let lat = target.coordinate.latitude, lon = target.coordinate.longitude
        let name = target.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        switch self {
        case .apple:
            let item = MKMapItem(placemark: MKPlacemark(coordinate: target.coordinate))
            item.name = target.name
            item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: mode.appleMapsMode])
        case .kakao:
            let by = switch mode { case .driving: "CAR"; case .walking: "FOOT"; case .transit: "PUBLICTRANSIT" }
            let start = origin.map { "sp=\($0.latitude),\($0.longitude)&" } ?? ""
            openApp("kakaomap://route?\(start)ep=\(lat),\(lon)&by=\(by)",
                    fallback: "https://map.kakao.com/link/to/\(name),\(lat),\(lon)")
        case .naver:
            let kind = switch mode { case .driving: "car"; case .walking: "walk"; case .transit: "public" }
            let bundle = Bundle.main.bundleIdentifier ?? "app"
            openApp("nmap://route/\(kind)?dlat=\(lat)&dlng=\(lon)&dname=\(name)&appname=\(bundle)",
                    fallback: "https://apps.apple.com/app/id311867728")
        case .tmap:
            openApp("tmap://route?goalname=\(name)&goalx=\(lon)&goaly=\(lat)",
                    fallback: "https://apps.apple.com/app/id431589174")
        }
    }

    @MainActor
    private func openApp(_ link: String, fallback: String) {
        guard let url = URL(string: link) else { return }
        UIApplication.shared.open(url) { opened in
            if !opened, let web = URL(string: fallback) { UIApplication.shared.open(web) }
        }
    }
}

extension MKMapItem {
    /// One-line address for a search result, e.g. "서울 강남구 테헤란로 152".
    var shortAddress: String? {
        let p = placemark
        let parts = [p.administrativeArea, p.locality, p.subLocality, p.thoroughfare, p.subThoroughfare]
            .compactMap { $0 }
        var seen: [String] = []
        for part in parts where !seen.contains(part) { seen.append(part) }
        return seen.isEmpty ? p.title : seen.joined(separator: " ")
    }
}

extension CLLocationDistance {
    var distanceText: String {
        Measurement(value: self, unit: UnitLength.meters)
            .formatted(.measurement(width: .abbreviated, usage: .road, numberFormatStyle: .number.precision(.fractionLength(0...1))))
    }
}

extension TimeInterval {
    var travelTimeText: String {
        Duration.seconds(self).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated))
    }
}
