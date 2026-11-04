//
//  KraftSessionPickerView.swift
//  FitTrackWatch Watch App
//
//  All plan days (freeform names from the phone, e.g. "Limbs", "Torso",
//  "Calves + forearms"), coloured like on the phone, today marked. Tapping
//  one starts it on the phone via WatchConnectivity; ContentView switches to
//  the logging screen as soon as the workout arrives.
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
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(phoneObserver.planSessions) { session in
                            Button {
                                start(session)
                            } label: {
                                row(session)
                            }
                            .buttonStyle(TileButtonStyle())
                            .disabled(startingSessionId != nil)
                        }
                    }
                    .padding(.horizontal, 2)
                }
            }
        }
        .navigationTitle("Trainingstage")
        .alert("Start fehlgeschlagen", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func row(_ session: WatchPlanSession) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Theme.hue(for: session.name))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 1) {
                Text(session.name)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(2)
                Text(subtitle(session))
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.label2)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if startingSessionId == session.id {
                ProgressView()
                    .frame(width: 20)
            } else {
                Image(systemName: "play.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.hue(for: session.name))
            }
        }
    }

    private func subtitle(_ session: WatchPlanSession) -> String {
        var parts: [String] = []
        if phoneObserver.todaySession?.id == session.id { parts.append("Heute") }
        parts.append("\(session.exercises.count) Übungen")
        if session.cardioAfter == true { parts.append("+ Cardio") }
        return parts.joined(separator: " · ")
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 22))
                .foregroundStyle(Theme.label2)
            Text("Kein Trainingsplan geladen")
                .font(.footnote)
                .multilineTextAlignment(.center)
            Text("Öffne die App auf dem iPhone, um die Pläne zu synchronisieren.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.label2)
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
