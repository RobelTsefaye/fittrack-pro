//
//  KraftSessionPickerView.swift
//  FitTrackWatch Watch App
//
//  Lets the user pick the upcoming strength-training session (e.g. "Limbs"
//  or "Torso" — freeform PlanSession names from the phone, not a fixed
//  enum) straight from the Watch, then starts it on the phone via
//  WatchConnectivity and navigates into KraftLoggingView. Reached from
//  ContentView's "Kraft" entry instead of immediately starting an
//  HKWorkoutSession.
//

import SwiftUI

struct KraftSessionPickerView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    @State private var startingSessionId: String?
    @State private var errorMessage: String?
    @State private var activeWorkout: WatchActiveWorkout?

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
        .navigationDestination(item: $activeWorkout) { workout in
            KraftLoggingView(phoneObserver: phoneObserver, workout: workout)
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
                switch result {
                case .success(let workout):
                    activeWorkout = workout
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}
