//
//  SetEntryView.swift
//  FitTrackWatch Watch App
//
//  Weight + reps for one set, Digital Crown first. Prefilled with the same
//  proposal the "Jetzt" card shows (logged value → the phone's progression
//  suggestion → last time → the set above). Saves via
//  PhoneWorkoutObserver.logSet (WatchConnectivity → phone → REST API);
//  correcting an already logged set works the same way.
//

import SwiftUI
import WatchKit

struct SetEntryView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    let workoutId: String
    let exercise: WatchWorkoutExercise
    let set: WatchSet

    @State private var weight: Double
    @State private var reps: Double
    @State private var isSaving = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    init(phoneObserver: PhoneWorkoutObserver, workoutId: String, exercise: WatchWorkoutExercise, set: WatchSet) {
        self.phoneObserver = phoneObserver
        self.workoutId = workoutId
        self.exercise = exercise
        self.set = set
        let proposal = exercise.proposal(for: set)
        _weight = State(initialValue: proposal.weight)
        _reps = State(initialValue: Double(proposal.reps))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                VStack(spacing: 1) {
                    Text(exercise.exercise.name)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                    Text(caption)
                        .font(.system(size: 12))
                        .foregroundStyle(set.isWarmup ? Theme.rest : Theme.label2)
                }

                HStack(spacing: 8) {
                    CrownStepperField(label: "Gewicht", unit: "kg", value: $weight, step: 2.5, range: 0...400)
                    CrownStepperField(label: "Wdh.", unit: "reps", value: $reps, step: 1, range: 0...50)
                }

                if let hint {
                    Text(hint)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.label2)
                        .multilineTextAlignment(.center)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                        .multilineTextAlignment(.center)
                }

                Button {
                    save()
                } label: {
                    if isSaving {
                        ProgressView().tint(Theme.voltInk)
                    } else {
                        Label(set.isCompleted ? "Korrigieren" : "Speichern", systemImage: "checkmark")
                    }
                }
                .buttonStyle(VoltButtonStyle())
                .disabled(isSaving)
            }
            .padding(.vertical, 4)
        }
        .navigationTitle(set.isWarmup ? "Aufwärmen" : "Satz \(exercise.workingPosition(of: set) ?? set.setNumber)")
    }

    private var caption: String {
        var parts: [String] = []
        if set.isWarmup {
            parts.append("Aufwärmsatz")
        } else if let position = exercise.workingPosition(of: set) {
            parts.append("Satz \(position) von \(exercise.workingSetCount)")
        }
        if let target = exercise.targetText { parts.append(target) }
        return parts.joined(separator: " · ")
    }

    private var hint: String? {
        var parts: [String] = []
        if let w = set.suggestedWeight, let r = set.suggestedReps {
            parts.append("Vorschlag \(Fmt.setLine(weight: w, reps: r))")
        }
        if let w = set.previousWeight, let r = set.previousReps {
            parts.append("zuletzt \(Fmt.setLine(weight: w, reps: r))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        let loggedWeight = weight
        let loggedReps = Int(reps)
        phoneObserver.logSet(workoutId: workoutId, setId: set.id, weight: loggedWeight, reps: loggedReps) { result in
            DispatchQueue.main.async {
                isSaving = false
                switch result {
                case .success(let personalRecord):
                    var updated = set
                    updated.weight = loggedWeight
                    updated.reps = loggedReps
                    updated.isCompleted = true
                    phoneObserver.applyLoggedSet(exerciseId: exercise.id, updatedSet: updated)
                    WKInterfaceDevice.current().play(personalRecord ? .notification : .success)
                    dismiss()
                case .failure(let error):
                    errorMessage = error.localizedDescription
                    WKInterfaceDevice.current().play(.failure)
                }
            }
        }
    }
}
