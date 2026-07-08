//
//  KraftSessionPickerView.swift
//  FitTrackWatch Watch App
//
//  Lets the user pick the upcoming strength-training session (e.g. "Limbs"
//  or "Torso" — freeform PlanSession names from the phone, not a fixed
//  enum) straight from the Watch, then starts it on the phone via
//  WatchConnectivity. Reached from ContentView's "Kraft" entry instead of
//  immediately starting an HKWorkoutSession.
//
//  Doesn't navigate anywhere itself on success — once the phone finishes
//  creating the workout, it pushes it via `updateApplicationContext`, which
//  sets `phoneObserver.activeWorkout` and makes ContentView's top-level
//  Group switch straight into KraftLoggingView, replacing this whole
//  picker/NavigationStack. See PhoneWorkoutObserver.swift for why this
//  doesn't ride the sendMessage reply instead.
//

import SwiftUI

struct KraftSessionPickerView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    @State private var startingSessionId: String?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if phoneObserver.planSessions.isEmpty {
                emptyState
            } else {
                List {
                    Section {
                        Text("Training wählen")
                            .font(.headline)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(phoneObserver.planSessions) { session in
                        Button {
                            start(session)
                        } label: {
                            HStack {
                                Text(session.name)
                                Spacer()
                                if startingSessionId == session.id {
                                    ProgressView()
                                }
                            }
                        }
                        .disabled(startingSessionId != nil)
                    }
                }
            }
        }
        .navigationTitle("Kraft")
        .alert("Fehler", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
            Text("Kein Trainingsplan geladen")
                .font(.caption)
                .multilineTextAlignment(.center)
            Text("Öffne die App auf dem iPhone, um die Pläne zu synchronisieren.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private func start(_ session: WatchPlanSession) {
        startingSessionId = session.id
        phoneObserver.startSession(session) { result in
            DispatchQueue.main.async {
                startingSessionId = nil
                if case .failure(let error) = result {
                    errorMessage = error.localizedDescription
                }
                // On success, ContentView routes away from this view once
                // phoneObserver.activeWorkout arrives — nothing to do here.
            }
        }
    }
}

#Preview("Sessions geladen") {
    // #Preview's trailing closure is a ViewBuilder context — a bare
    // assignment statement (Void-returning) directly in it gets treated as
    // "this should be a View" and fails to compile, so the mutation happens
    // inside an ordinary immediately-invoked closure instead.
    let observer: PhoneWorkoutObserver = {
        let o = PhoneWorkoutObserver()
        o.planSessions = [
            WatchPlanSession(id: "s1", name: "Push", order: 0, exercises: []),
            WatchPlanSession(id: "s2", name: "Pull", order: 1, exercises: []),
            WatchPlanSession(id: "s3", name: "Legs", order: 2, exercises: []),
        ]
        return o
    }()
    return NavigationStack {
        KraftSessionPickerView(phoneObserver: observer)
    }
}

#Preview("Kein Plan geladen") {
    NavigationStack {
        KraftSessionPickerView(phoneObserver: PhoneWorkoutObserver())
    }
}
