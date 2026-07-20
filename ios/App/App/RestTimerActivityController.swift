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

    /// Drops a stashed start whose rest period already elapsed while the app
    /// was backgrounded — the common case, since the phone may not come back
    /// to the foreground for hours. Replaying it verbatim would pin an
    /// already-expired countdown into the Dynamic Island with nothing left to
    /// end it.
    static func takePendingStart() -> Double? {
        guard let endsAt = WatchOfflineWorkoutStore.takePendingRestTimerLiveActivity() else { return nil }
        guard endsAt > Date().timeIntervalSince1970 else { return nil }
        return endsAt
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
