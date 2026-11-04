//
//  StrengthSessionView.swift
//  FitTrackWatch Watch App
//
//  A strength workout (started on the phone or from the Watch's home
//  screen) — laid out like Apple's Workout app: swipe right for controls,
//  the middle page logs sets, swipe left for live heart rate and calories.
//

import SwiftUI
import WatchKit

struct StrengthSessionView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    @ObservedObject var workoutManager: WorkoutManager
    let workout: WatchActiveWorkout

    @State private var page = 1

    var body: some View {
        TabView(selection: $page) {
            StrengthControlsView(phoneObserver: phoneObserver, workoutManager: workoutManager, workout: workout)
                .tag(0)
            NavigationStack {
                KraftLoggingView(phoneObserver: phoneObserver, initialWorkout: workout)
            }
            .tag(1)
            LiveMetricsView(workoutManager: workoutManager, title: workout.name ?? "Training", accent: Theme.hue(for: workout.name ?? ""))
                .tag(2)
        }
        .tabViewStyle(.page)
        .onChange(of: workout.workoutId) { _, _ in
            page = 1
        }
    }
}

/// Pause/resume heart rate, finish (saved on the phone), cancel (deleted).
struct StrengthControlsView: View {
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
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(Theme.hue(for: workout.name ?? ""))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(workout.completedSetCount) von \(workout.totalSetCount) Sätzen")
                    .font(.footnote)
                    .foregroundStyle(Theme.label2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 8) {
                    if workoutManager.isRunning {
                        ControlCircle(
                            icon: workoutManager.isPaused ? "play.fill" : "pause.fill",
                            label: workoutManager.isPaused ? "Weiter" : "Pause",
                            color: Theme.rest
                        ) {
                            workoutManager.isPaused ? workoutManager.resume() : workoutManager.pause()
                        }
                    }
                    ControlCircle(icon: "xmark", label: "Verwerfen", color: Theme.danger) {
                        showCancelConfirm = true
                    }
                    .disabled(isFinishing || isCancelling)
                }

                Button {
                    finish()
                } label: {
                    if isFinishing {
                        ProgressView().tint(Theme.voltInk)
                    } else {
                        Label("Beenden", systemImage: "flag.checkered")
                    }
                }
                .buttonStyle(VoltButtonStyle())
                .disabled(isFinishing || isCancelling)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                        .multilineTextAlignment(.center)
                    // Escape hatch when the phone keeps failing: leave on the
                    // Watch only, the workout stays open on the phone.
                    Button {
                        phoneObserver.endWorkoutLocally(workout.workoutId)
                    } label: {
                        Label("Nur Uhr verlassen", systemImage: "applewatch.slash")
                            .font(.footnote)
                    }
                    .buttonStyle(TileButtonStyle())
                }
            }
            .padding(.horizontal, 4)
        }
        .confirmationDialog("Workout verwerfen?", isPresented: $showCancelConfirm, titleVisibility: .visible) {
            Button("Verwerfen", role: .destructive) { cancel() }
            Button("Zurück", role: .cancel) {}
        } message: {
            Text("Es wird nicht gespeichert.")
        }
    }

    private func finish() {
        isFinishing = true
        errorMessage = nil
        phoneObserver.finishWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                isFinishing = false
                switch result {
                case .success:
                    // Leave right away instead of waiting for the phone's
                    // context push — the coordinator saves the HR session and
                    // shows the summary (with the cardio offer).
                    phoneObserver.endWorkoutLocally(workout.workoutId)
                case .failure(let error):
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
                switch result {
                case .success:
                    phoneObserver.endWorkoutLocally(workout.workoutId)
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

/// Round control like Apple's Workout app (icon in a tinted circle, label below).
struct ControlCircle: View {
    let icon: String
    let label: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(color)
                    .frame(width: 52, height: 52)
                    .background(color.opacity(0.22), in: Circle())
                Text(label)
                    .font(.system(size: 12))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
