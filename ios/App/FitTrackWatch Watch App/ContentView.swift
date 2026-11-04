//
//  ContentView.swift
//  FitTrackWatch Watch App
//
//  Top-level router. Priority, top to bottom:
//   1. waiting for the Health permission (nothing works without it)
//   2. a strength workout from the phone → logging (+ controls, live HR)
//   3. a running session on the Watch (cardio, or strength HR without a
//      phone workout yet) → live screen
//   4. a just-finished session → summary, with the cardio offer after a
//      day flagged "Cardio danach"
//   5. home: today's day, cardio, all days, Health
//
//  Session logic lives in WatchCoordinator / WorkoutManager — this file only
//  decides what to show.
//

import SwiftUI

struct ContentView: View {
    @ObservedObject var coordinator: WatchCoordinator
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    @ObservedObject var routeTracker: RouteLocationTracker

    var body: some View {
        Group {
            if !workoutManager.authorizationGranted && !workoutManager.isRunning && !workoutManager.isStarting {
                AuthorizationView(workoutManager: workoutManager)
            } else if let workout = phoneObserver.activeWorkout {
                StrengthSessionView(phoneObserver: phoneObserver, workoutManager: workoutManager, workout: workout)
            } else if (workoutManager.isRunning || workoutManager.isStarting)
                        && (!workoutManager.isEnding || workoutManager.queuedStartTitle != nil) {
                SessionLiveView(workoutManager: workoutManager, routeTracker: routeTracker)
            } else if let finish = coordinator.finish {
                FinishView(coordinator: coordinator, summary: finish)
            } else {
                HomeView(coordinator: coordinator, workoutManager: workoutManager, phoneObserver: phoneObserver)
            }
        }
        .tint(Theme.volt)
    }
}

private struct AuthorizationView: View {
    @ObservedObject var workoutManager: WorkoutManager

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "heart.text.square.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.heart)
                Text("FitTrack")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                if let error = workoutManager.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                        .multilineTextAlignment(.center)
                    Button("Erneut fragen") { workoutManager.requestAuthorization() }
                        .buttonStyle(VoltButtonStyle())
                } else {
                    Text("Bitte Health-Zugriff erlauben – für Puls, Kalorien und das Speichern deiner Trainings.")
                        .font(.footnote)
                        .foregroundStyle(Theme.label2)
                        .multilineTextAlignment(.center)
                    ProgressView()
                }
            }
            .padding(.horizontal, 4)
        }
    }
}
