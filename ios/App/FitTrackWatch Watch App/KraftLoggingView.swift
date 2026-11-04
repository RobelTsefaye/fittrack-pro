//
//  KraftLoggingView.swift
//  FitTrackWatch Watch App
//
//  Logging a strength workout. Top to bottom:
//   • time and progress
//   • the rest countdown (±15 s, synced with the phone bar and Live Activity)
//   • "Jetzt": the next set with the phone's suggestion — one tap logs it,
//     "Anpassen" opens the Crown entry
//   • every exercise with its sets (tap to log or correct) and "+ Satz"
//   • finish
//  Reads only `phoneObserver.activeWorkout`, the single source of truth that
//  both the phone's pushes and the Watch's own logs flow through.
//

import SwiftUI
import WatchKit

struct KraftLoggingView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    /// Fallback for the single frame between finishing and ContentView
    /// tearing this view down (when `activeWorkout` briefly goes nil).
    let initialWorkout: WatchActiveWorkout

    @State private var loggingSetId: String?
    @State private var addingExerciseId: String?
    @State private var actionError: String?
    @State private var isFinishing = false

    private var workout: WatchActiveWorkout {
        phoneObserver.activeWorkout ?? initialWorkout
    }

    private var hue: Color { Theme.hue(for: workout.name ?? "") }

    var body: some View {
        // ScrollView, not List: the "Jetzt" card holds two controls, and in
        // a watchOS list row every button of the row fires together.
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                StatusRow(workout: workout, hue: hue)

                if let endsAt = workout.restTimerEndsAt {
                    RestCard(endsAt: endsAt, phoneObserver: phoneObserver, workoutId: workout.workoutId)
                }

                if let next = workout.nextOpen {
                    NowCard(
                        phoneObserver: phoneObserver,
                        workoutId: workout.workoutId,
                        exercise: next.exercise,
                        set: next.set,
                        hue: hue,
                        isLogging: loggingSetId == next.set.id
                    ) {
                        quickLog(exercise: next.exercise, set: next.set)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        Label("Alle Sätze erledigt", systemImage: "checkmark.seal.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.volt)
                        Text("Unten beenden – oder mit „+ Satz“ weitermachen.")
                            .font(.footnote)
                            .foregroundStyle(Theme.label2)
                    }
                    .padding(.vertical, 4)
                }

                if let actionError {
                    Text(actionError)
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                }

                ForEach(workout.workoutExercises) { exercise in
                    ExerciseHeader(exercise: exercise, hue: hue)
                        .padding(.top, 8)
                    ForEach(exercise.sets) { set in
                        NavigationLink {
                            SetEntryView(phoneObserver: phoneObserver, workoutId: workout.workoutId, exercise: exercise, set: set)
                        } label: {
                            SetRow(exercise: exercise, set: set, isNext: workout.nextOpen?.set.id == set.id, hue: hue)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 9)
                                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    Button {
                        addSet(to: exercise)
                    } label: {
                        HStack(spacing: 6) {
                            if addingExerciseId == exercise.id {
                                ProgressView()
                            } else {
                                Image(systemName: "plus")
                                Text("Satz")
                            }
                        }
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.label2)
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .background(Theme.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(addingExerciseId != nil)
                }

                Button {
                    finish()
                } label: {
                    if isFinishing {
                        ProgressView().tint(Theme.voltInk)
                    } else {
                        Label("Workout beenden", systemImage: "flag.checkered")
                    }
                }
                .buttonStyle(VoltButtonStyle())
                .disabled(isFinishing)
                .padding(.top, 10)
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(workout.name ?? "Training")
        // RestCard's own haptic only fires while it's on screen and ticking —
        // this schedules a real watchOS notification as a backstop, delivered
        // even if the app is in the background when the rest ends.
        .onChange(of: workout.restTimerEndsAt) { _, newValue in
            if let newValue {
                WatchRestTimerNotifications.schedule(endsAt: newValue)
            } else {
                WatchRestTimerNotifications.cancel()
            }
        }
        .onAppear {
            if let endsAt = workout.restTimerEndsAt {
                WatchRestTimerNotifications.schedule(endsAt: endsAt)
            }
        }
    }

    // MARK: - Actions

    /// Logs the next set with the proposed values (suggestion → last time →
    /// set above), exactly what the "Jetzt" card shows.
    private func quickLog(exercise: WatchWorkoutExercise, set: WatchSet) {
        guard loggingSetId == nil else { return }
        let proposal = exercise.proposal(for: set)
        loggingSetId = set.id
        actionError = nil
        phoneObserver.logSet(workoutId: workout.workoutId, setId: set.id, weight: proposal.weight, reps: proposal.reps) { result in
            DispatchQueue.main.async {
                loggingSetId = nil
                switch result {
                case .success(let personalRecord):
                    var updated = set
                    updated.weight = proposal.weight
                    updated.reps = proposal.reps
                    updated.isCompleted = true
                    phoneObserver.applyLoggedSet(exerciseId: exercise.id, updatedSet: updated)
                    WKInterfaceDevice.current().play(personalRecord ? .notification : .success)
                case .failure(let error):
                    actionError = error.localizedDescription
                    WKInterfaceDevice.current().play(.failure)
                }
            }
        }
    }

    private func addSet(to exercise: WatchWorkoutExercise) {
        addingExerciseId = exercise.id
        actionError = nil
        phoneObserver.addSet(workoutId: workout.workoutId, workoutExerciseId: exercise.id) { result in
            DispatchQueue.main.async {
                addingExerciseId = nil
                if case .failure(let error) = result {
                    actionError = error.localizedDescription
                }
            }
        }
    }

    private func finish() {
        isFinishing = true
        actionError = nil
        phoneObserver.finishWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    // Leave right away (the phone's clear push can lag); the
                    // coordinator saves the HR session and shows the summary.
                    phoneObserver.endWorkoutLocally(workout.workoutId)
                case .failure(let error):
                    isFinishing = false
                    actionError = error.localizedDescription
                }
            }
        }
    }
}

// MARK: - Pieces

/// Elapsed time (from the server start, so it matches the phone) and sets done.
private struct StatusRow: View {
    let workout: WatchActiveWorkout
    let hue: Color

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            if let startedAt = workout.startedAtDate {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(Fmt.clock(Int(context.date.timeIntervalSince(startedAt))))
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.volt)
                }
            }
            Spacer(minLength: 4)
            Text("\(workout.completedSetCount)/\(workout.totalSetCount)")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(hue)
            Text("Sätze")
                .font(.system(size: 11))
                .foregroundStyle(Theme.label2)
        }
    }
}

/// The next set, big, with the proposal and one-tap logging.
private struct NowCard: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    let workoutId: String
    let exercise: WatchWorkoutExercise
    let set: WatchSet
    let hue: Color
    let isLogging: Bool
    let onDone: () -> Void

    var body: some View {
        let proposal = exercise.proposal(for: set)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Eyebrow(text: "Jetzt", color: hue)
                if exercise.supersetGroup != nil {
                    Text("SUPERSATZ")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.rest)
                }
            }
            Text(exercise.exercise.name)
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Text(setCaption)
                .font(.footnote)
                .foregroundStyle(Theme.label2)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(Fmt.weight(proposal.weight))
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text("kg")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.label2)
                Text("×")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Theme.label2)
                Text("\(proposal.reps)")
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                    .monospacedDigit()
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            if let hint {
                Text(hint)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.label2)
                    .lineLimit(2)
            }
            HStack(spacing: 6) {
                Button(action: onDone) {
                    if isLogging {
                        ProgressView().tint(Theme.voltInk)
                    } else {
                        Image(systemName: "checkmark")
                            .font(.system(size: 18, weight: .bold))
                    }
                }
                .buttonStyle(VoltButtonStyle())
                .disabled(isLogging)
                NavigationLink {
                    SetEntryView(phoneObserver: phoneObserver, workoutId: workoutId, exercise: exercise, set: set)
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 50, height: 44)
                        .background(Theme.raised, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(
            LinearGradient(colors: [hue.opacity(0.22), Theme.surface], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
    }

    private var setCaption: String {
        var parts: [String] = []
        if set.isWarmup {
            parts.append("Aufwärmsatz")
        } else if let position = exercise.workingPosition(of: set) {
            parts.append("Satz \(position) von \(exercise.workingSetCount)")
        }
        if let target = exercise.targetText { parts.append(target) }
        return parts.joined(separator: " · ")
    }

    /// Where the proposal comes from — like the phone's hint under a set.
    private var hint: String? {
        if set.suggestedWeight != nil, let w = set.previousWeight, let r = set.previousReps {
            return "Vorschlag · zuletzt \(Fmt.setLine(weight: w, reps: r))"
        }
        if let w = set.previousWeight, let r = set.previousReps {
            return "Letztes Mal \(Fmt.setLine(weight: w, reps: r))"
        }
        return nil
    }
}

/// Rest countdown — a pure function of `endsAt` (server data), so it reads
/// the same on every device. ±15 s is applied here at once and persisted
/// server-side, so the phone bar and Live Activity follow.
private struct RestCard: View {
    let endsAt: Double
    let phoneObserver: PhoneWorkoutObserver
    let workoutId: String

    /// Optimistic local nudge until the confirmed `endsAt` comes back.
    @State private var adjustSeconds: Double = 0
    /// One haptic per rest period when it runs out on screen.
    @State private var expiredHapticFired = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = (endsAt + adjustSeconds) - context.date.timeIntervalSince1970
            if remaining > 0 {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        Eyebrow(text: "Pause", color: Theme.rest)
                        Text(Fmt.clock(Int(remaining.rounded(.up))))
                            .font(.system(size: 30, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Theme.rest)
                    }
                    Spacer(minLength: 0)
                    nudgeButton("gobackward.15", delta: -15)
                    nudgeButton("goforward.15", delta: 15)
                }
                .padding(10)
                .background(Theme.rest.opacity(0.16), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                Color.clear
                    .frame(height: 0)
                    .onAppear { fireExpiredHapticIfNeeded() }
            }
        }
        .onChange(of: endsAt) { _, _ in
            adjustSeconds = 0
            expiredHapticFired = false
        }
    }

    private func nudgeButton(_ icon: String, delta: Int) -> some View {
        Button {
            adjustSeconds += Double(delta)
            phoneObserver.adjustRestTimer(workoutId: workoutId, deltaSeconds: delta) { _ in
                // A successful round trip pushes the new endsAt (which resets
                // the local nudge); a failed one keeps the optimistic nudge.
            }
        } label: {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.rest)
                .frame(width: 34, height: 34)
                .background(Theme.rest.opacity(0.18), in: Circle())
        }
        .buttonStyle(.plain)
    }

    private func fireExpiredHapticIfNeeded() {
        guard !expiredHapticFired else { return }
        expiredHapticFired = true
        WKInterfaceDevice.current().play(.notification)
    }
}

private struct ExerciseHeader: View {
    let exercise: WatchWorkoutExercise
    let hue: Color

    var body: some View {
        HStack(spacing: 4) {
            Text(exercise.exercise.name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.label2)
                .lineLimit(1)
            if exercise.supersetGroup != nil {
                Image(systemName: "link")
                    .foregroundStyle(Theme.rest)
            }
            Spacer(minLength: 2)
            Text("\(exercise.completedCount)/\(exercise.sets.count)")
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(exercise.completedCount == exercise.sets.count && !exercise.sets.isEmpty ? Theme.volt : Theme.label2)
        }
    }
}

private struct SetRow: View {
    let exercise: WatchWorkoutExercise
    let set: WatchSet
    let isNext: Bool
    let hue: Color

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 14, weight: isNext ? .semibold : .regular))
                .foregroundStyle(set.isWarmup ? Theme.rest : (isNext ? hue : .white))
            Spacer(minLength: 2)
            if set.isCompleted {
                Text(Fmt.setLine(weight: set.weight, reps: set.reps))
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .monospacedDigit()
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Theme.volt)
            } else {
                let proposal = exercise.proposal(for: set)
                Text(Fmt.setLine(weight: proposal.weight, reps: proposal.reps))
                    .font(.system(size: 13, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Theme.label2)
                Image(systemName: "circle")
                    .foregroundStyle(isNext ? hue : Theme.label2)
            }
        }
    }

    private var label: String {
        if set.isWarmup { return "Aufw." }
        return "Satz \(exercise.workingPosition(of: set) ?? set.setNumber)"
    }
}
