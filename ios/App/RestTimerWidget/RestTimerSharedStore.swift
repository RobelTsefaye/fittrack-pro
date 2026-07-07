import Foundation

/**
 * Hand-off channel between the Dynamic Island +/- buttons (AdjustRestTimerIntent,
 * runs in the RestTimerWidgetExtension process) and the JS rest timer
 * (rest-timer-context.tsx, source of truth while the app is foregrounded).
 *
 * The intent updates the running Activity directly (it has its own ActivityKit
 * access) AND writes the resulting state here. RestTimerActivityPlugin reads
 * it once when the app becomes active and forwards it to JS via a bridge
 * event, so the in-app timer stays in sync with adjustments made from the
 * island/lock screen while the app was backgrounded.
 *
 * Compiled into BOTH the App and RestTimerWidgetExtension targets (see
 * project.pbxproj) — same mechanism as RestTimerWidgetAttributes.swift.
 */
enum RestTimerSharedStore {
    static let suiteName = "group.com.robeltsefaye.fittrackpro"
    private static let key = "fittrack.restTimerAdjustment"

    struct Adjustment: Codable {
        /// New countdown end, ms epoch — set when the timer is running.
        var endsAt: Double?
        /// New paused remaining seconds — set when the timer is paused.
        var pausedRemainingSeconds: Int?
        /// The +/- amount that was applied, for JS-side duration bookkeeping.
        var deltaSeconds: Int
    }

    static func write(_ adjustment: Adjustment) {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }
        guard let data = try? JSONEncoder().encode(adjustment) else { return }
        defaults.set(data, forKey: key)
    }

    /// Reads and clears the pending adjustment, if any. Consuming exactly
    /// once avoids re-applying the same delta on a later app activation.
    static func consume() -> Adjustment? {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return nil }
        guard let data = defaults.data(forKey: key) else { return nil }
        defaults.removeObject(forKey: key)
        return try? JSONDecoder().decode(Adjustment.self, from: data)
    }
}
