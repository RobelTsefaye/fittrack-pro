import Foundation
import WatchConnectivity
import Combine

/**
 * Receives workout-state pushes from the paired iPhone (see
 * WatchConnectivityPlugin.swift on the phone side) via
 * `updateApplicationContext`. ContentView shows this alongside the Watch's
 * own standalone workout option — if a phone workout is active, the Watch
 * can just mirror it instead of starting a separate session.
 */
final class PhoneWorkoutObserver: NSObject, ObservableObject {
    @Published var isPhoneWorkoutActive = false
    @Published var exerciseName = ""
    @Published var currentSet = 0
    @Published var totalSets = 0
    @Published var weight: Double?
    @Published var reps: Int?

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func apply(_ context: [String: Any]) {
        DispatchQueue.main.async {
            let active = context["active"] as? Bool ?? false
            self.isPhoneWorkoutActive = active
            guard active else { return }
            self.exerciseName = context["exerciseName"] as? String ?? ""
            self.currentSet = context["currentSet"] as? Int ?? 0
            self.totalSets = context["totalSets"] as? Int ?? 0
            self.weight = context["weight"] as? Double
            self.reps = context["reps"] as? Int
        }
    }
}

extension PhoneWorkoutObserver: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Pick up whatever context was already set before this session activated
        // (e.g. Watch app launched after the phone workout already started).
        apply(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }
}
