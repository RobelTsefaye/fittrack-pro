//
//  RouteStatsView.swift
//  FitTrackWatch Watch App
//
//  Pace / speed / distance breakdown for outdoor workouts (Laufen/Radfahren),
//  as its own swipe page alongside the metrics and map screens (see
//  LiveWorkoutView) — the map has no spare room for more than a one-line
//  distance readout, so the fuller numbers get their own dedicated page.
//

import SwiftUI

struct RouteStatsView: View {
    @ObservedObject var tracker: RouteLocationTracker
    @ObservedObject var workoutManager: WorkoutManager

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("Strecke")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)

                Text(formattedDistance)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.cyan)

                HStack(spacing: 10) {
                    statCard(icon: "speedometer", color: .green, label: "Pace", value: paceDisplay)
                    statCard(icon: "gauge.with.dots.needle.67percent", color: .orange, label: "km/h", value: speedDisplay)
                }
            }
            .padding()
        }
        .background(
            LinearGradient(colors: [.black, .cyan.opacity(0.18)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
    }

    @ViewBuilder
    private func statCard(icon: String, color: Color, label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }

    private var distanceKm: Double { tracker.distanceMeters / 1000 }

    private var formattedDistance: String {
        String(format: "%.2f km", distanceKm)
    }

    /// Below this, a tiny elapsed-time denominator turns a few meters of
    /// residual GPS noise into a wildly swinging speed/pace figure (e.g.
    /// jumping between 1 and 20 km/h second to second right after the
    /// workout starts) — hold off showing either until there's enough time
    /// and distance for the ratio to actually mean something.
    private let minElapsedSecondsForRate = 20
    private let minDistanceMetersForRate = 30.0

    /// Average speed in km/h — average, not instantaneous, since the Watch
    /// has no reliable moment-to-moment speed sample of its own to smooth;
    /// distance-over-elapsed-time is stable and matches what the eventual
    /// workout summary computes.
    private var speedKmh: Double? {
        guard workoutManager.elapsedSeconds >= minElapsedSecondsForRate,
              tracker.distanceMeters >= minDistanceMetersForRate else { return nil }
        let hours = Double(workoutManager.elapsedSeconds) / 3600
        return distanceKm / hours
    }

    private var speedDisplay: String {
        guard let speedKmh else { return "—" }
        return String(format: "%.1f", speedKmh)
    }

    /// Pace in min:sec per km — the inverse of speed, shown the way runners
    /// actually read it rather than as a km/h figure.
    private var paceDisplay: String {
        guard workoutManager.elapsedSeconds >= minElapsedSecondsForRate,
              tracker.distanceMeters >= minDistanceMetersForRate else { return "—" }
        let secondsPerKm = Double(workoutManager.elapsedSeconds) / distanceKm
        guard secondsPerKm.isFinite, secondsPerKm > 0 else { return "—" }
        let minutes = Int(secondsPerKm) / 60
        let seconds = Int(secondsPerKm) % 60
        return String(format: "%d:%02d/km", minutes, seconds)
    }
}

#Preview {
    let tracker: RouteLocationTracker = {
        let t = RouteLocationTracker()
        return t
    }()
    let manager: WorkoutManager = {
        let m = WorkoutManager()
        m.elapsedSeconds = 1230
        return m
    }()
    return RouteStatsView(tracker: tracker, workoutManager: manager)
}
