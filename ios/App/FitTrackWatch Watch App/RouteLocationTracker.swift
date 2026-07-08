//
//  RouteLocationTracker.swift
//  FitTrackWatch Watch App
//
//  Collects GPS coordinates during outdoor workouts (Laufen/Radfahren) so
//  RouteMapView can draw the route covered so far, live, directly on the
//  Watch — mirrors what watchOS's own Workout app does, using only
//  on-device CoreLocation (no Google/Apple Maps SDK needed on watchOS;
//  MapKit is the native renderer). Not used for Kraft/HIIT, which use
//  .indoor locationType and have no meaningful route to draw.
//

import Foundation
import CoreLocation
import Combine

@MainActor
final class RouteLocationTracker: NSObject, ObservableObject {
    /// The route covered so far, in order. RouteMapView draws this as a
    /// polyline and keeps the map centered on the latest point.
    @Published private(set) var coordinates: [CLLocationCoordinate2D] = []
    @Published var authorizationDenied = false

    private let manager = CLLocationManager()
    /// Drop obviously-bad fixes (GPS warm-up jumps, indoor multipath) rather
    /// than drawing a route that spikes across the map.
    private let minAccuracyMeters: CLLocationAccuracy = 50

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        // Meaningful movement only — cuts needless updates/battery while
        // standing still (e.g. at a red light mid-run).
        manager.distanceFilter = 5
        manager.activityType = .fitness
    }

    /// Starts fresh — call once per workout so a previous run's tail isn't
    /// still on screen when a new one begins.
    func start() {
        coordinates = []
        authorizationDenied = false
        let status = manager.authorizationStatus
        switch status {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            authorizationDenied = true
        default:
            manager.startUpdatingLocation()
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
    }
}

extension RouteLocationTracker: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.startUpdatingLocation()
            case .denied, .restricted:
                self.authorizationDenied = true
            default:
                break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            for location in locations where location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= self.minAccuracyMeters {
                self.coordinates.append(location.coordinate)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Non-fatal — the workout's HR/calorie tracking is unaffected; the
        // route simply stays wherever it last got to.
    }
}
