//
//  SetEntryView.swift
//  FitTrackWatch Watch App
//
//  Weight + reps entry for a single set, using the Digital Crown for fast
//  input. Saves via PhoneWorkoutObserver.logSet (WatchConnectivity
//  sendMessage → phone → REST API), then reports back to KraftLoggingView
//  so the local set list + personal-record haptic can update.
//

import SwiftUI

struct SetEntryView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    let workoutId: String
    let set: WatchSet
    let exerciseName: String
    let onSaved: (WatchSet, Bool) -> Void

    @State private var weight: Double
    @State private var reps: Double
    @State private var isSaving = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    init(phoneObserver: PhoneWorkoutObserver, workoutId: String, set: WatchSet, exerciseName: String, onSaved: @escaping (WatchSet, Bool) -> Void) {
        self.phoneObserver = phoneObserver
        self.workoutId = workoutId
        self.set = set
        self.exerciseName = exerciseName
        self.onSaved = onSaved
        // Prefill with what was actually logged, then the last session's
        // values for this exact set, and only fall back to a generic
        // default when neither exists (first time ever logging this set).
        _weight = State(initialValue: set.weight ?? set.previousWeight ?? 20)
        _reps = State(initialValue: Double(set.reps ?? set.previousReps ?? 10))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(exerciseName)
                    .font(.caption)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                Text(set.isWarmup ? "Warm-up" : "Satz \(set.setNumber)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(set.isWarmup ? .orange : .secondary)

                HStack(spacing: 12) {
                    CrownStepperField(label: "Gewicht", unit: "kg", value: $weight, step: 1.25, range: 0...400)
                    CrownStepperField(label: "Wdh.", unit: "reps", value: $reps, step: 1, range: 0...50)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Button {
                    save()
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Label("Speichern", systemImage: "checkmark")
                    }
                }
                .tint(.green)
                .disabled(isSaving)
            }
            .padding(.vertical, 6)
        }
        .navigationTitle("Satz \(set.setNumber)")
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        phoneObserver.logSet(workoutId: workoutId, setId: set.id, weight: weight, reps: Int(reps)) { result in
            DispatchQueue.main.async {
                isSaving = false
                switch result {
                case .success(let personalRecord):
                    var updated = set
                    updated.weight = weight
                    updated.reps = Int(reps)
                    updated.isCompleted = true
                    onSaved(updated, personalRecord)
                    dismiss()
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        SetEntryView(
            phoneObserver: PhoneWorkoutObserver(),
            workoutId: "preview-workout-1",
            set: WatchSet(id: "set2", setNumber: 2, reps: nil, weight: nil, isCompleted: false),
            exerciseName: "Bankdrücken"
        ) { _, _ in }
    }
}
