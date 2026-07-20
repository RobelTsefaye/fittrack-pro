import Foundation
import ActivityKit

/// Process-wide ActivityKit owner shared by the Capacitor bridge and the
/// Watch API proxy. It deliberately has no WebView dependency: a Watch set
/// can arrive while the WebView has not been created at all.
enum RestTimerActivityController {
    @available(iOS 16.1, *)
    static var activity: Activity<RestTimerWidgetAttributes>? {
        Activity<RestTimerWidgetAttributes>.activities.first
    }

    /// Background-safe: updates a running Activity immediately; otherwise
    /// persists a foreground-only start request in the App Group.
    static func sync(endsAt: Double) {
        guard #available(iOS 16.1, *) else { return }
        let state = RestTimerWidgetAttributes.ContentState(
            endDate: Date(timeIntervalSince1970: endsAt),
            pausedRemainingSeconds: nil
        )
        if let activity {
            Task { await activity.update(.init(state: state, staleDate: nil)) }
        } else {
            WatchOfflineWorkoutStore.savePendingRestTimerLiveActivity(endsAt: endsAt)
        }
    }

    static func takePendingStart() -> Double? {
        WatchOfflineWorkoutStore.takePendingRestTimerLiveActivity()
    }

    static func clearPendingStart() {
        WatchOfflineWorkoutStore.clearPendingRestTimerLiveActivity()
    }

    @available(iOS 16.1, *)
    static func endAll() {
        for activity in Activity<RestTimerWidgetAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
}
