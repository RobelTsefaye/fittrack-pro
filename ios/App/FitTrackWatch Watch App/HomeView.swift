//
//  HomeView.swift
//  FitTrackWatch Watch App
//
//  Start screen, same order of importance as the phone's workouts page:
//  today's plan day first (one tap starts it on the phone and opens the
//  logging screen here), then cardio, all days, Health.
//

import SwiftUI

struct HomeView: View {
    @ObservedObject var coordinator: WatchCoordinator
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    @State private var startingSessionId: String?
    @State private var errorMessage: String?

    private var columns: [GridItem] { [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    todayCard

                    Eyebrow(text: "Cardio")
                        .padding(.top, 4)
                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(CardioKind.allCases) { kind in
                            NavigationLink {
                                CardioConfigView(coordinator: coordinator, kind: kind)
                            } label: {
                                CardioTile(kind: kind)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Eyebrow(text: "Mehr")
                        .padding(.top, 4)
                    NavigationLink {
                        KraftSessionPickerView(phoneObserver: phoneObserver)
                    } label: {
                        rowLabel(icon: "dumbbell.fill", title: "Alle Trainingstage", color: Theme.volt)
                    }
                    .buttonStyle(TileButtonStyle())
                    NavigationLink {
                        HealthDashboardView(workoutManager: workoutManager, phoneObserver: phoneObserver)
                    } label: {
                        rowLabel(icon: "heart.text.square.fill", title: "Health", color: Theme.heart)
                    }
                    .buttonStyle(TileButtonStyle())
                }
                .padding(.horizontal, 2)
            }
            .navigationTitle("FitTrack")
        }
        .alert("Start fehlgeschlagen", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Today

    @ViewBuilder
    private var todayCard: some View {
        if let today = phoneObserver.todaySession {
            let hue = Theme.hue(for: today.name)
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: "Heute", color: hue)
                Text(today.name)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(todaySubtitle(today))
                    .font(.footnote)
                    .foregroundStyle(Theme.label2)
                Button {
                    start(today)
                } label: {
                    if startingSessionId == today.id {
                        ProgressView().tint(Theme.voltInk)
                    } else {
                        Label("Starten", systemImage: "play.fill")
                    }
                }
                .buttonStyle(VoltButtonStyle(fill: hue))
                .disabled(startingSessionId != nil)
                .padding(.top, 2)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(colors: [hue.opacity(0.28), Theme.surface], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
        } else if phoneObserver.planSessions.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(text: "Training")
                Text("Noch kein Plan auf der Uhr")
                    .font(.system(size: 15, weight: .semibold))
                Text("Öffne FitTrack einmal auf dem iPhone, dann sind deine Trainingstage hier.")
                    .font(.footnote)
                    .foregroundStyle(Theme.label2)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(text: "Heute")
                Text("Ruhetag")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                if let next = phoneObserver.nextSession {
                    Text("\(next.label): \(next.session.name)")
                        .font(.footnote)
                        .foregroundStyle(Theme.hue(for: next.session.name))
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func todaySubtitle(_ session: WatchPlanSession) -> String {
        var parts = ["\(session.exercises.count) Übungen"]
        if session.cardioAfter == true { parts.append("danach Cardio") }
        return parts.joined(separator: " · ")
    }

    private func start(_ session: WatchPlanSession) {
        startingSessionId = session.id
        phoneObserver.startSession(session) { result in
            DispatchQueue.main.async {
                startingSessionId = nil
                if case .failure(let error) = result {
                    errorMessage = error.localizedDescription
                }
                // On success ContentView switches to the logging screen as
                // soon as the workout arrives.
            }
        }
    }

    private func rowLabel(icon: String, title: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 22)
            Text(title)
                .font(.system(size: 15, weight: .medium))
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.label2)
        }
    }
}

/// Square-ish cardio tile: icon, name, indoor/outdoor.
struct CardioTile: View {
    let kind: CardioKind
    var highlighted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Image(systemName: kind.icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(highlighted ? Theme.voltInk : Theme.volt)
            Text(kind.title)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(highlighted ? Theme.voltInk : .white)
            Text(kind.subtitle)
                .font(.system(size: 11))
                .foregroundStyle(highlighted ? Theme.voltInk.opacity(0.7) : Theme.label2)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
        .padding(10)
        .background(highlighted ? Theme.volt : Theme.raised, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
