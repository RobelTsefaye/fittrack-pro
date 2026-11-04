//
//  SessionLiveView.swift
//  FitTrackWatch Watch App
//
//  A session running on the Watch itself — cardio (treadmill, indoor bike,
//  elliptical, outdoor run/ride, walk) or the strength heart-rate session
//  while the phone workout hasn't arrived yet. Apple-Workout-style pages:
//  controls on the left, metrics in the middle, route pages for outdoor.
//  The same numbers stream to the phone's cardio page every second.
//

import SwiftUI
import HealthKit

struct SessionLiveView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var routeTracker: RouteLocationTracker

    @State private var page = 1

    private var title: String {
        if let queued = workoutManager.queuedStartTitle { return queued }
        if workoutManager.currentActivityType == .traditionalStrengthTraining { return "Krafttraining" }
        return workoutManager.activePlan?.title ?? "Training"
    }

    var body: some View {
        TabView(selection: $page) {
            SessionControlsView(workoutManager: workoutManager)
                .tag(0)
            LiveMetricsView(workoutManager: workoutManager, title: title, accent: Theme.volt)
                .tag(1)
            if workoutManager.usesGPS {
                RouteMapView(tracker: routeTracker)
                    .tag(2)
                RouteStatsView(tracker: routeTracker, workoutManager: workoutManager)
                    .tag(3)
            }
        }
        .tabViewStyle(.page)
    }
}

/// Pause/resume, end (saved to Health), discard.
private struct SessionControlsView: View {
    @ObservedObject var workoutManager: WorkoutManager

    @State private var showDiscardConfirm = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    ControlCircle(
                        icon: workoutManager.isPaused ? "play.fill" : "pause.fill",
                        label: workoutManager.isPaused ? "Weiter" : "Pause",
                        color: Theme.rest
                    ) {
                        workoutManager.isPaused ? workoutManager.resume() : workoutManager.pause()
                    }
                    .disabled(!workoutManager.isRunning)
                    ControlCircle(icon: "xmark", label: "Verwerfen", color: Theme.danger) {
                        showDiscardConfirm = true
                    }
                }
                Button {
                    workoutManager.stop()
                } label: {
                    Label("Beenden", systemImage: "stop.fill")
                }
                .buttonStyle(VoltButtonStyle())
                Text("Wird in Health gespeichert und erscheint in FitTrack und Apple Fitness.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.label2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 4)
        }
        .confirmationDialog("Training verwerfen?", isPresented: $showDiscardConfirm, titleVisibility: .visible) {
            Button("Verwerfen", role: .destructive) { workoutManager.cancel() }
            Button("Zurück", role: .cancel) {}
        } message: {
            Text("Es wird nichts in Health gespeichert.")
        }
    }
}

/// Time, heart rate (zone-coloured), calories and — per activity — distance,
/// steps, target zone and remaining time. Left-aligned like Apple's Workout
/// app so the numbers read top to bottom at a glance.
struct LiveMetricsView: View {
    @ObservedObject var workoutManager: WorkoutManager
    let title: String
    let accent: Color

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(accent)
                        .lineLimit(1)
                    Spacer()
                    if workoutManager.isPaused {
                        Text("PAUSE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Theme.rest)
                    }
                }

                if let alert = workoutManager.sessionAlert {
                    Text(alertText(alert))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(alertColor(alert))
                }

                Text(Fmt.clock(workoutManager.elapsedSeconds))
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(workoutManager.isPaused ? Theme.rest : Theme.volt)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)

                if (workoutManager.isStarting && !workoutManager.isRunning) || workoutManager.queuedStartTitle != nil {
                    HStack(spacing: 6) {
                        ProgressView()
                        Text("Startet …")
                            .font(.footnote)
                            .foregroundStyle(Theme.label2)
                    }
                }

                metricRow(
                    value: workoutManager.heartRate > 0 ? "\(Int(workoutManager.heartRate))" : "––",
                    unit: "BPM",
                    icon: "heart.fill",
                    color: heartColor
                )
                metricRow(
                    value: "\(Int(workoutManager.activeCalories))",
                    unit: "KCAL",
                    icon: "flame.fill",
                    color: Theme.energy
                )
                if workoutManager.currentActivityType == .walking {
                    metricRow(value: "\(workoutManager.stepCount)", unit: stepUnit, icon: "shoeprints.fill", color: Theme.volt)
                } else if workoutManager.distanceMeters > 0 {
                    metricRow(value: distanceText, unit: "KM", icon: "point.topleft.down.to.point.bottomright.curvepath", color: Color(hex: 0x4CC2FF))
                }

                if workoutManager.usesHeartRateZones {
                    ZoneBar(zone: workoutManager.currentHeartRateZone, heartRate: workoutManager.heartRate, target: workoutManager.activePlan?.targetZone)
                        .padding(.top, 4)
                }

                if let minutes = workoutManager.activePlan?.durationMinutes {
                    let remaining = max(0, minutes * 60 - workoutManager.elapsedSeconds)
                    Text("Noch \(Fmt.clock(remaining)) von \(minutes) min")
                        .font(.footnote)
                        .foregroundStyle(Theme.label2)
                        .padding(.top, 2)
                }

                if let error = workoutManager.errorMessage, !workoutManager.isRunning {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
    }

    private var heartColor: Color {
        guard workoutManager.usesHeartRateZones, let zone = workoutManager.currentHeartRateZone else { return Theme.heart }
        return Theme.zoneColor(zone)
    }

    private var stepUnit: String {
        if let goal = workoutManager.activePlan?.stepGoal { return "/ \(goal)" }
        return "SCHRITTE"
    }

    private var distanceText: String {
        String(format: "%.2f", workoutManager.distanceMeters / 1000).replacingOccurrences(of: ".", with: ",")
    }

    @ViewBuilder
    private func metricRow(value: String, unit: String, icon: String, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text(unit)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(color)
            Spacer(minLength: 0)
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(color)
        }
    }

    private func alertText(_ alert: WorkoutManager.CardioSessionAlert) -> String {
        switch alert {
        case .enteredTargetZone: return "Zielzone erreicht"
        case .leftTargetZone: return "Zielzone verlassen"
        case .halftime: return "Halbzeit"
        case .stepGoalReached: return "Ziel erreicht"
        }
    }

    private func alertColor(_ alert: WorkoutManager.CardioSessionAlert) -> Color {
        switch alert {
        case .enteredTargetZone, .stepGoalReached: return Theme.zoneColor(3)
        case .leftTargetZone: return Theme.rest
        case .halftime: return Theme.zoneColor(1)
        }
    }
}

/// Five zone segments; the current one is full-height with a pointer showing
/// where in the zone the heart rate sits (same as the phone's cardio page),
/// the target zone gets a volt outline.
struct ZoneBar: View {
    let zone: Int?
    let heartRate: Double
    let target: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 3) {
                ForEach(1...5, id: \.self) { z in
                    ZStack {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Theme.zoneColor(z).opacity(z == zone ? 1 : 0.28))
                            .frame(height: z == zone ? 8 : 5)
                        if z == target {
                            RoundedRectangle(cornerRadius: 3)
                                .stroke(Theme.volt, lineWidth: 1.5)
                                .frame(height: 10)
                        }
                        if z == zone {
                            GeometryReader { geo in
                                Capsule()
                                    .fill(.white)
                                    .frame(width: 2.5, height: 12)
                                    .position(x: geo.size.width * HeartRateZones.positionWithinZone(bpm: heartRate, zone: z), y: geo.size.height / 2)
                            }
                        }
                    }
                    .frame(height: 12)
                }
            }
            Text(zone.map { "Zone \($0) · \(HeartRateZones.labelDe(forZone: $0))" } ?? "Noch keine Zone")
                .font(.system(size: 11))
                .foregroundStyle(zone.map { Theme.zoneColor($0) } ?? Theme.label2)
        }
    }
}
