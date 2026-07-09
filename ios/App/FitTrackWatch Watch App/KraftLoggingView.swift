//
//  KraftLoggingView.swift
//  FitTrackWatch Watch App
//
//  Lists the exercises/sets of an active strength-training workout (started
//  from KraftSessionPickerView) and lets the user tap into SetEntryView to
//  log weight/reps for each set. Intentionally independent of
//  WorkoutManager/HKWorkoutSession — this is a pure logging flow, not tied
//  to HR/calorie tracking, so it can't be interrupted by ContentView
//  switching to LiveWorkoutView.
//

import SwiftUI

struct KraftLoggingView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    /// Fallback for the single frame between finishing and ContentView
    /// tearing this view down (when `activeWorkout` briefly goes nil).
    /// Otherwise everything reads from `phoneObserver.activeWorkout` — the
    /// single source of truth — so phone-side edits and Watch-side logs both
    /// stay reflected here (see PhoneWorkoutObserver.applyLoggedSet).
    let initialWorkout: WatchActiveWorkout

    @State private var isFinishing = false
    @State private var finishError: String?

    private var workout: WatchActiveWorkout {
        phoneObserver.activeWorkout ?? initialWorkout
    }

    var body: some View {
        List {
            if let endsAt = workout.restTimerEndsAt {
                Section {
                    RestTimerRow(endsAt: endsAt)
                }
            }

            ForEach(workout.workoutExercises) { exercise in
                Section(exercise.exercise.name) {
                    ForEach(exercise.sets) { set in
                        NavigationLink {
                            SetEntryView(
                                phoneObserver: phoneObserver,
                                workoutId: workout.workoutId,
                                set: set,
                                exerciseName: exercise.exercise.name
                            ) { updated, _ in
                                phoneObserver.applyLoggedSet(exerciseId: exercise.id, updatedSet: updated)
                            }
                        } label: {
                            setRow(set)
                        }
                    }
                }
            }

            Section {
                Button {
                    finish()
                } label: {
                    if isFinishing {
                        ProgressView()
                    } else {
                        Label("Workout beenden", systemImage: "flag.checkered")
                    }
                }
                .tint(.red)
                .disabled(isFinishing)

                if let finishError {
                    Text(finishError)
                        .font(.caption2)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(workout.name ?? "Training")
    }

    @ViewBuilder
    private func setRow(_ set: WatchSet) -> some View {
        HStack {
            // isWarmup was missing from the Watch payload entirely — every
            // set rendered identically as "Satz N", so a warmup set logged
            // on the phone looked like a normal working set here.
            if set.isWarmup {
                Text("Warm-up")
                    .foregroundStyle(.orange)
            } else {
                Text("Satz \(set.setNumber)")
            }
            Spacer()
            if set.isCompleted {
                Text("\(formattedWeight(set.weight)) kg × \(set.reps ?? 0)")
                    .foregroundStyle(.secondary)
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else {
                Image(systemName: "circle")
                    .foregroundStyle(.secondary)
            }
        }
        .font(.system(size: 14))
    }

    private func formattedWeight(_ w: Double?) -> String {
        guard let w else { return "–" }
        return w.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", w) : String(format: "%.1f", w)
    }

    private func finish() {
        isFinishing = true
        finishError = nil
        phoneObserver.finishWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    // Exit locally right away (tears this view down via
                    // ContentView) instead of depending on the phone's
                    // context-clear push, which can lag or never arrive —
                    // see PhoneWorkoutObserver.endWorkoutLocally.
                    phoneObserver.endWorkoutLocally(workout.workoutId)
                case .failure(let error):
                    isFinishing = false
                    finishError = error.localizedDescription
                }
            }
        }
    }
}

/// Ticking countdown to `endsAt` (epoch seconds) — derived purely from
/// server data (most recent set completion, or workout start) by both the
/// phone's push and the Watch's own no-phone-open native path, so it's
/// identical and race-free regardless of which device completed the last
/// set or which one is currently connected. Self-hides once expired; no
/// separate "stop" signal needed.
private struct RestTimerRow: View {
    let endsAt: Double

    /// +/- nudges the display only on *this* Watch — not synced back to the
    /// phone (that would need a persisted, server-side adjustment to stay
    /// race-free the same way `endsAt` itself is). Reset whenever `endsAt`
    /// actually changes, i.e. a genuinely new rest period started; stable
    /// across the ~1s re-syncs of the *same* period, since those repeatedly
    /// carry the identical `endsAt` value.
    @State private var adjustSeconds: Double = 0

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = (endsAt + adjustSeconds) - context.date.timeIntervalSince1970
            if remaining > 0 {
                VStack(spacing: 4) {
                    HStack {
                        Label("Pause", systemImage: "timer")
                            .foregroundStyle(.orange)
                        Spacer()
                        Text(formattedRemaining(remaining))
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                    }
                    HStack(spacing: 20) {
                        Button {
                            adjustSeconds -= 15
                        } label: {
                            Label("15s", systemImage: "gobackward.15")
                        }
                        Button {
                            adjustSeconds += 15
                        } label: {
                            Label("15s", systemImage: "goforward.15")
                        }
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .foregroundStyle(.orange)
                }
            }
        }
        .onChange(of: endsAt) { _, _ in
            adjustSeconds = 0
        }
    }

    private func formattedRemaining(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.up)))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

#Preview("Mit Pausen-Timer") {
    let mockWorkout = WatchActiveWorkout(
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
        ],
        restTimerEndsAt: Date().timeIntervalSince1970 + 62
    )
    // #Preview's trailing closure is a ViewBuilder context — a bare
    // assignment statement (Void-returning) directly in it gets treated as
    // "this should be a View" and fails to compile. Do the mutation inside
    // an ordinary immediately-invoked closure instead.
    let observer: PhoneWorkoutObserver = {
        let o = PhoneWorkoutObserver()
        o.activeWorkout = mockWorkout
        return o
    }()
    NavigationStack {
        KraftLoggingView(phoneObserver: observer, initialWorkout: mockWorkout)
    }
}

#Preview {
    let mockWorkout = WatchActiveWorkout(
        workoutId: "preview-workout-1",
        name: "Push",
        workoutExercises: [
            WatchWorkoutExercise(
                id: "we1",
                exercise: WatchExerciseInfo(id: "e1", name: "Bankdrücken", muscleGroup: "Brust"),
                sets: [
                    WatchSet(id: "set1", setNumber: 1, reps: 10, weight: 60, isCompleted: true),
                    WatchSet(id: "set2", setNumber: 2, reps: nil, weight: nil, isCompleted: false),
                    WatchSet(id: "set3", setNumber: 3, reps: nil, weight: nil, isCompleted: false),
                ]
            ),
            WatchWorkoutExercise(
                id: "we2",
                exercise: WatchExerciseInfo(id: "e2", name: "Schulterdrücken", muscleGroup: "Schultern"),
                sets: [
                    WatchSet(id: "set4", setNumber: 1, reps: nil, weight: nil, isCompleted: false),
                ]
            ),
        ]
    )
    let observer: PhoneWorkoutObserver = {
        let o = PhoneWorkoutObserver()
        o.activeWorkout = mockWorkout
        return o
    }()
    NavigationStack {
        KraftLoggingView(phoneObserver: observer, initialWorkout: mockWorkout)
    }
}
