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
            Text("Satz \(set.setNumber)")
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
    let observer = PhoneWorkoutObserver()
    observer.activeWorkout = mockWorkout
    return NavigationStack {
        KraftLoggingView(phoneObserver: observer, initialWorkout: mockWorkout)
    }
}
