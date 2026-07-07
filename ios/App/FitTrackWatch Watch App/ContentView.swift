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
//  (via PhoneWorkoutObserver / WatchConnectivity): starting a workout on the
//  phone jumps the Watch straight into the same logging UI used for
//  Watch-initiated sessions (KraftLoggingView), auto-starts HR/calorie
//  tracking, and pages over to the live HR screen with a swipe — no manual
//  "start tracking" tap needed.
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

    /// Which page of the phone-workout TabView is showing. Defaults to the
    /// logging page (1) — swipe right for controls (0), left for live HR (2).
    @State private var selectedPage = 1

    var body: some View {
        Group {
            if !workoutManager.authorizationGranted {
                AuthorizationView(workoutManager: workoutManager)
            } else if let activeWorkout = phoneObserver.activeWorkout {
                // A phone-started workout takes priority: page 1 is the same
                // logging UI as the Watch-initiated flow (auto-synced sets),
                // page 0 (swipe right) is pause/finish/cancel controls, page 2
                // (swipe left) is the live HR/calorie screen.
                TabView(selection: $selectedPage) {
                    NavigationStack {
                        WorkoutControlsView(phoneObserver: phoneObserver, workoutManager: workoutManager, workout: activeWorkout)
                    }
                    .tag(0)
                    NavigationStack {
                        KraftLoggingView(phoneObserver: phoneObserver, initialWorkout: activeWorkout)
                    }
                    .tag(1)
                    NavigationStack {
                        LiveWorkoutView(workoutManager: workoutManager, phoneObserver: phoneObserver)
                    }
                    .tag(2)
                }
                .tabViewStyle(.page)
            } else if workoutManager.isRunning {
                NavigationStack {
                    LiveWorkoutView(workoutManager: workoutManager, phoneObserver: phoneObserver)
                }
            } else {
                StartView(workoutManager: workoutManager, phoneObserver: phoneObserver)
            }
        }
        .onAppear {
            workoutManager.requestAuthorization()
        }
        .onChange(of: phoneObserver.activeWorkout?.workoutId) { oldId, newId in
            if newId != nil {
                selectedPage = 1
                if !workoutManager.isRunning {
                    // Phone workout just started (or the Watch app just
                    // launched into one already running) — HR/calories track
                    // continuously for the whole session, no manual button.
                    workoutManager.start(activityType: .traditionalStrengthTraining)
                }
            } else if newId == nil, oldId != nil {
                // Always consume the flag, even when no HR session is running,
                // so a stale `true` can't misclassify the *next* workout's
                // finish as a cancel.
                let wasCancelled = phoneObserver.pendingCancellation
                phoneObserver.pendingCancellation = false
                if workoutManager.isRunning {
                    if wasCancelled {
                        // Cancelled via WorkoutControlsView — discard the
                        // Watch's own HR session instead of saving a workout
                        // the user explicitly threw away.
                        workoutManager.cancel()
                    } else {
                        // Finished normally — save the Watch's own session
                        // too, so it doesn't keep running unseen.
                        workoutManager.stop()
                    }
                }
            }
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
 *  phone workout is active (see ContentView's TabView otherwise). */
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
 * Reached by swiping right from KraftLoggingView (page 0 of the phone-
 * workout TabView). Lets the user pause/resume the Watch's own HR/calorie
 * tracking, finish the workout (saved on the phone, HR session saved on the
 * Watch), or cancel it entirely (deleted on the phone, HR session discarded
 * — see ContentView's onChange for how the two are told apart).
 */
private struct WorkoutControlsView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    @ObservedObject var workoutManager: WorkoutManager
    let workout: WatchActiveWorkout

    @State private var isFinishing = false
    @State private var isCancelling = false
    @State private var errorMessage: String?
    @State private var showCancelConfirm = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(workout.name ?? "Training")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                if workoutManager.isRunning {
                    Button {
                        workoutManager.isPaused ? workoutManager.resume() : workoutManager.pause()
                    } label: {
                        Label(
                            workoutManager.isPaused ? "Fortsetzen" : "Pausieren",
                            systemImage: workoutManager.isPaused ? "play.fill" : "pause.fill"
                        )
                    }
                    .tint(.orange)
                }

                Button {
                    finish()
                } label: {
                    if isFinishing {
                        ProgressView()
                    } else {
                        Label("Workout beenden", systemImage: "flag.checkered")
                    }
                }
                .tint(.green)
                .disabled(isFinishing || isCancelling)

                Button(role: .destructive) {
                    showCancelConfirm = true
                } label: {
                    if isCancelling {
                        ProgressView()
                    } else {
                        Label("Workout abbrechen", systemImage: "xmark.circle")
                    }
                }
                .disabled(isFinishing || isCancelling)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
            }
            .padding()
        }
        .navigationTitle("Steuerung")
        .confirmationDialog(
            "Workout wirklich abbrechen?",
            isPresented: $showCancelConfirm,
            titleVisibility: .visible
        ) {
            Button("Ja, verwerfen", role: .destructive) { cancel() }
            Button("Zurück", role: .cancel) {}
        } message: {
            Text("Das Workout wird nicht gespeichert.")
        }
    }

    private func finish() {
        isFinishing = true
        errorMessage = nil
        phoneObserver.finishWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                isFinishing = false
                // On success, the phone clears the shared state via
                // updateApplicationContext, which — through ContentView's
                // onChange — takes us back to StartView and saves the
                // Watch's own HR session. Nothing else to do here.
                if case .failure(let error) = result {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func cancel() {
        isCancelling = true
        errorMessage = nil
        phoneObserver.cancelWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                isCancelling = false
                if case .failure(let error) = result {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

private struct LiveWorkoutView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    var body: some View {
        VStack(spacing: 6) {
            if let workout = phoneObserver.activeWorkout {
                Text(workout.name ?? "Training")
                    .font(.caption)
                    .lineLimit(1)
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

            if phoneObserver.activeWorkout == nil {
                // Only offer a manual stop for Watch-only sessions — phone-
                // mirrored workouts stop automatically when finished on the
                // phone (see ContentView's onChange), avoiding two different
                // "end workout" actions that could disagree with each other.
                Button(role: .destructive) {
                    workoutManager.stop()
                } label: {
                    Label("Beenden", systemImage: "stop.fill")
                }
                .tint(.red)
                .padding(.top, 4)
            }
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

#Preview("Start") {
    ContentView()
}

#Preview("Phone-Workout (Paging)") {
    let observer = PhoneWorkoutObserver()
    observer.activeWorkout = WatchActiveWorkout(
        workoutId: "preview-workout-1",
        name: "Push",
        workoutExercises: [
            WatchWorkoutExercise(
                id: "we1",
                exercise: WatchExerciseInfo(id: "e1", name: "Bankdrücken", muscleGroup: "Brust"),
                sets: [
                    WatchSet(id: "set1", setNumber: 1, reps: 10, weight: 60, isCompleted: true),
                    WatchSet(id: "set2", setNumber: 2, reps: nil, weight: nil, isCompleted: false),
                ]
            ),
        ]
    )
    let manager = WorkoutManager()
    manager.isRunning = true
    manager.heartRate = 128
    manager.activeCalories = 96
    manager.elapsedSeconds = 412
    return TabView {
        NavigationStack { WorkoutControlsView(phoneObserver: observer, workoutManager: manager, workout: observer.activeWorkout!) }.tag(0)
        NavigationStack { KraftLoggingView(phoneObserver: observer, initialWorkout: observer.activeWorkout!) }.tag(1)
        NavigationStack { LiveWorkoutView(workoutManager: manager, phoneObserver: observer) }.tag(2)
    }
    .tabViewStyle(.page)
}

#Preview("Live Workout (Watch-only)") {
    let manager = WorkoutManager()
    manager.isRunning = true
    manager.heartRate = 142
    manager.activeCalories = 213
    manager.elapsedSeconds = 754
    return NavigationStack {
        LiveWorkoutView(workoutManager: manager, phoneObserver: PhoneWorkoutObserver())
    }
}
