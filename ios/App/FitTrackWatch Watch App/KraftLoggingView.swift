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
    @State var workout: WatchActiveWorkout

    @State private var isFinishing = false
    @State private var finishError: String?
    @State private var didFinish = false

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
                                apply(updated, to: exercise.id)
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
        .navigationTitle(workout.name)
        .alert("Workout beendet", isPresented: $didFinish) {
            Button("OK") {}
        }
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

    private func apply(_ updated: WatchSet, to exerciseId: String) {
        guard let exerciseIndex = workout.workoutExercises.firstIndex(where: { $0.id == exerciseId }),
              let setIndex = workout.workoutExercises[exerciseIndex].sets.firstIndex(where: { $0.id == updated.id }) else {
            return
        }
        workout.workoutExercises[exerciseIndex].sets[setIndex] = updated
    }

    private func finish() {
        isFinishing = true
        finishError = nil
        phoneObserver.finishWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                isFinishing = false
                switch result {
                case .success:
                    didFinish = true
                case .failure(let error):
                    finishError = error.localizedDescription
                }
            }
        }
    }
}
