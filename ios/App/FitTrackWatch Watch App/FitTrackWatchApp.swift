//
//  FitTrackWatchApp.swift
//  FitTrackWatch Watch App
//
//  Created by Robel Tsefaye on 07.07.26.
//

import SwiftUI
import WatchKit
import HealthKit

@main
struct FitTrackWatch_Watch_AppApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @StateObject private var coordinator = WatchCoordinator.shared

    init() {
        // Wire phone messages, live updates and session handling before any
        // screen appears — the app is often launched in the background.
        WatchCoordinator.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(
                coordinator: coordinator,
                workoutManager: coordinator.workoutManager,
                phoneObserver: coordinator.phoneObserver,
                routeTracker: coordinator.routeTracker
            )
        }
    }
}

/// Launch paths that bypass SwiftUI: the phone starting a workout
/// (`HKHealthStore.startWatchApp`) and watchOS relaunching after a crash
/// mid-workout.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        WatchCoordinator.shared.activate()
    }

    /// The phone asked for a workout of this type (cardio after a strength
    /// day, or waking the Watch for a strength workout). The session has to
    /// start here — see WatchCoordinator.handleLaunch.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        WatchCoordinator.shared.handleLaunch(with: workoutConfiguration)
    }

    func handleActiveWorkoutRecovery() {
        WatchCoordinator.shared.activate()
        WatchCoordinator.shared.workoutManager.recoverActiveSession()
    }
}
