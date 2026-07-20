import Foundation
import ActivityKit

/// Process-wide ActivityKit owner shared by the Capacitor bridge and the
/// Watch API proxy. It deliberately has no WebView dependency: a Watch set
/// can arrive while the WebView has not been created at all.
enum RestTimerActivityController {
    /// The Activity currently on screen, if any.
    ///
    /// `Activity.activities` also contains activities that have already
    /// ENDED but that iOS has not dismissed from its store yet — Apple
    /// documents it as "currently active or recently ended." Taking `.first`
    /// unfiltered therefore routinely hands back a corpse: `update()` on it
    /// is a silent no-op, so `sync` below would report "there is an Activity,
    /// just update it" and never stash a pending start. The Dynamic Island
    /// then stayed empty for the rest of the app's lifetime, because once one
    /// rest period had ended there was always a dead Activity shadowing the
    /// live one.
    @available(iOS 16.1, *)
    static var activity: Activity<RestTimerWidgetAttributes>? {
        Activity<RestTimerWidgetAttributes>.activities.first { $0.activityState == .active }
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
            NSLog("[RestTimerActivity] sync: updating live Activity %@ (ends in %.0fs)",
                  activity.id, endsAt - Date().timeIntervalSince1970)
            Task { await activity.update(.init(state: state, staleDate: nil)) }
        } else {
            NSLog("[RestTimerActivity] sync: no live Activity — stashing start for next foreground")
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
