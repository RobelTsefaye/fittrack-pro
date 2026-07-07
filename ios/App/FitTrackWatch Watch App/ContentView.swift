//
//  ContentView.swift
//  FitTrackWatch Watch App
//
//  Live workout screen: heart rate + active calories + elapsed time,
//  streamed from HKLiveWorkoutBuilder via WorkoutManager. The finished
//  workout saves to HealthKit and appears in the iPhone app's Cardio
//  section on the next HealthKit sync — no direct network call needed
//  from the Watch itself.
//
//  Also mirrors whatever workout is currently active on the paired iPhone
//  (via PhoneWorkoutObserver / WatchConnectivity) — if the phone has a
//  workout going, that takes priority over the manual type-picker so the
//  Watch shows "what's happening right now" instead of asking the user to
//  redundantly pick a type it could already infer.
//

import SwiftUI
import HealthKit

/** Workout types offered on the Watch's start screen, with German labels
 *  and SF Symbols matching the phone app's iconography. */
private struct WorkoutTypeOption: Identifiable {
    let id: HKWorkoutActivityType
    let label: String
    let icon: String

    static let all: [WorkoutTypeOption] = [
        WorkoutTypeOption(id: .traditionalStrengthTraining, label: "Kraft", icon: "figure.strengthtraining.traditional"),
        WorkoutTypeOption(id: .running, label: "Laufen", icon: "figure.run"),
        WorkoutTypeOption(id: .cycling, label: "Radfahren", icon: "figure.outdoor.cycle"),
        WorkoutTypeOption(id: .highIntensityIntervalTraining, label: "HIIT", icon: "figure.highintensity.intervaltraining"),
    ]
}

struct ContentView: View {
    @StateObject private var workoutManager = WorkoutManager()
    @StateObject private var phoneObserver = PhoneWorkoutObserver()

    var body: some View {
        Group {
            if !workoutManager.authorizationGranted {
                AuthorizationView(workoutManager: workoutManager)
            } else if workoutManager.isRunning {
                LiveWorkoutView(workoutManager: workoutManager, phoneObserver: phoneObserver)
            } else if phoneObserver.isPhoneWorkoutActive {
                PhoneMirrorView(phoneObserver: phoneObserver, workoutManager: workoutManager)
            } else {
                StartView(workoutManager: workoutManager, phoneObserver: phoneObserver)
            }
        }
        .onAppear {
            workoutManager.requestAuthorization()
        }
    }
}

private struct AuthorizationView: View {
    @ObservedObject var workoutManager: WorkoutManager

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 32))
                .foregroundStyle(.red)
            Text("FitTrack")
                .font(.headline)
            if let error = workoutManager.errorMessage {
                Text(error)
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            } else {
                Text("Warte auf Health-Berechtigung…")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

/** Shown before every workout — including after a finished one ends and
 *  `ContentView` falls back to StartView, so the user always re-picks the
 *  type rather than the last choice sticking around. Only reached when no
 *  phone workout is active (see PhoneMirrorView otherwise). */
private struct StartView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Workout wählen")
                        .font(.headline)
                        .listRowBackground(Color.clear)
                }
                ForEach(WorkoutTypeOption.all) { option in
                    if option.id == .traditionalStrengthTraining {
                        // Kraft opens the custom session-picker/logging flow
                        // instead of immediately starting an HKWorkoutSession —
                        // kept independent of workoutManager so the user isn't
                        // yanked into LiveWorkoutView mid-log (see ContentView's
                        // isRunning-first Group switch).
                        NavigationLink {
                            KraftSessionPickerView(phoneObserver: phoneObserver)
                        } label: {
                            Label(option.label, systemImage: option.icon)
                        }
                    } else {
                        Button {
                            workoutManager.start(activityType: option.id)
                        } label: {
                            Label(option.label, systemImage: option.icon)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Shown while a workout is running on the paired iPhone and the Watch
 * hasn't started its own HKWorkoutSession yet — mirrors the current
 * exercise/set instead of asking the user to manually pick a type the app
 * already knows. Offers a one-tap button to also start HR/calorie tracking
 * on the Watch itself (phone workouts are strength-focused, so that's the
 * activity type used).
 */
private struct PhoneMirrorView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    @ObservedObject var workoutManager: WorkoutManager

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.gen3")
                .font(.system(size: 20))
                .foregroundStyle(.secondary)

            Text(phoneObserver.exerciseName.isEmpty ? "Workout aktiv" : phoneObserver.exerciseName)
                .font(.headline)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            if phoneObserver.totalSets > 0 {
                Text("Satz \(phoneObserver.currentSet) / \(phoneObserver.totalSets)")
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .monospacedDigit()
            }

            if let weight = phoneObserver.weight, let reps = phoneObserver.reps {
                Text("\(formattedWeight(weight)) kg × \(reps)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                workoutManager.start(activityType: .traditionalStrengthTraining)
            } label: {
                Label("HF tracken", systemImage: "heart.fill")
            }
            .tint(.red)
            .padding(.top, 4)
        }
        .padding()
    }

    private func formattedWeight(_ w: Double) -> String {
        w.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", w) : String(format: "%.1f", w)
    }
}

private struct LiveWorkoutView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    var body: some View {
        VStack(spacing: 6) {
            // Phone exercise/set banner — shown alongside the Watch's own
            // HR/calorie session when both are active at once (the common
            // case: user starts HR tracking after already logging a set).
            if phoneObserver.isPhoneWorkoutActive {
                VStack(spacing: 1) {
                    Text(phoneObserver.exerciseName)
                        .font(.caption)
                        .lineLimit(1)
                    if phoneObserver.totalSets > 0 {
                        Text("Satz \(phoneObserver.currentSet)/\(phoneObserver.totalSets)")
                            .font(.system(size: 11, weight: .medium))
                    }
                }
                .foregroundStyle(.secondary)
                .padding(.bottom, 2)
            }

            Text(formattedTime)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()

            HStack(spacing: 16) {
                MetricView(
                    icon: "heart.fill",
                    color: .red,
                    value: workoutManager.heartRate > 0 ? "\(Int(workoutManager.heartRate))" : "—",
                    unit: "bpm"
                )
                MetricView(
                    icon: "flame.fill",
                    color: .orange,
                    value: "\(Int(workoutManager.activeCalories))",
                    unit: "kcal"
                )
            }

            Button(role: .destructive) {
                workoutManager.stop()
            } label: {
                Label("Beenden", systemImage: "stop.fill")
            }
            .tint(.red)
            .padding(.top, 4)
        }
        .padding()
    }

    private var formattedTime: String {
        let m = workoutManager.elapsedSeconds / 60
        let s = workoutManager.elapsedSeconds % 60
        return String(format: "%d:%02d", m, s)
    }
}

private struct MetricView: View {
    let icon: String
    let color: Color
    let value: String
    let unit: String

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text(unit)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    ContentView()
}
