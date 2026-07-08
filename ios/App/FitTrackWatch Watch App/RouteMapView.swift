//
//  RouteMapView.swift
//  FitTrackWatch Watch App
//
//  Draws the route covered so far during an outdoor workout as a live
//  polyline on a native MapKit map — the watchOS-native equivalent of what
//  Apple's own Workout app shows, no Google Maps SDK needed/available on
//  watchOS. Shown as an extra swipe page alongside the HR/calorie screen
//  for Laufen/Radfahren only (see LiveWorkoutView).
//

import SwiftUI
import MapKit

struct RouteMapView: View {
    @ObservedObject var tracker: RouteLocationTracker

    var body: some View {
        Group {
            if tracker.authorizationDenied {
                deniedState
            } else if tracker.coordinates.count < 2 {
                waitingState
            } else {
                Map(position: .constant(cameraPosition)) {
                    MapPolyline(coordinates: tracker.coordinates)
                        .stroke(.red, lineWidth: 4)
                    if let last = tracker.coordinates.last {
                        Annotation("", coordinate: last) {
                            Circle()
                                .fill(.red)
                                .frame(width: 10, height: 10)
                                .overlay(Circle().stroke(.white, lineWidth: 2))
                        }
                    }
                }
                .mapControls { /* no controls — screen is tiny, keep it clean */ }
            }
        }
    }

    /// Recomputed each render from the current route so the map always
    /// frames "everything covered so far" — simpler than manually panning a
    /// persistent camera and good enough at Watch-map scale.
    private var cameraPosition: MapCameraPosition {
        guard !tracker.coordinates.isEmpty else {
            return .automatic
        }
        let region = MKCoordinateRegion(routeCoordinates: tracker.coordinates)
        return .region(region)
    }

    private var waitingState: some View {
        VStack(spacing: 6) {
            Image(systemName: "location.circle")
                .font(.system(size: 24))
                .foregroundStyle(.secondary)
            Text("Suche GPS…")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var deniedState: some View {
        VStack(spacing: 6) {
            Image(systemName: "location.slash")
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
            Text("Standortzugriff verweigert")
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

private extension MKCoordinateRegion {
    /// A region tightly framing all given coordinates, with a small padding
    /// factor so the route isn't drawn edge-to-edge, and a sane minimum span
    /// so a single-point/near-stationary start doesn't zoom in absurdly far.
    init(routeCoordinates: [CLLocationCoordinate2D]) {
        let lats = routeCoordinates.map(\.latitude)
        let lons = routeCoordinates.map(\.longitude)
        let minLat = lats.min()!
        let maxLat = lats.max()!
        let minLon = lons.min()!
        let maxLon = lons.max()!

        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        let minSpan = 0.003 // ~300m — keeps an early/short route from over-zooming
        let padding = 1.4
        let span = MKCoordinateSpan(
            latitudeDelta: max(minSpan, (maxLat - minLat) * padding),
            longitudeDelta: max(minSpan, (maxLon - minLon) * padding)
        )
        self.init(center: center, span: span)
    }
}
