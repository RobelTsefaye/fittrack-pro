//
//  WatchRecoverySnapshotStore.swift
//  FitTrackWatch Watch App
//
//  Persists the Recovery Score PhoneWorkoutObserver receives via
//  WatchConnectivity into THIS device's own App Group container, for
//  FitTrackComplication to read.
//
//  App Groups do not sync across the iPhone↔Watch boundary — the identical
//  suite name "group.com.robeltsefaye.fittrackpro" on the phone
//  (SharedDataPlugin.swift) and on the Watch are two entirely separate,
//  per-device containers. FitTrackComplication.swift was written assuming
//  it could read what the phone wrote directly, which is why it never showed
//  real data on physical hardware. This is the missing other half: the Watch
//  app itself writes into its OWN local container, using the exact same JSON
//  shape (RecoverySnapshot: score/level/updatedAt, ISO8601) the complication
//  already decodes.
//

import Foundation
import WidgetKit

enum WatchRecoverySnapshotStore {
    private static let appGroup = "group.com.robeltsefaye.fittrackpro"
    private static let snapshotKey = "recoveryScoreSnapshot"
    private static let complicationKind = "FitTrackComplication"

    /// Call whenever a fresh recoveryScore/recoveryLevel arrives via
    /// WatchConnectivity (see PhoneWorkoutObserver.apply). Writes locally and
    /// asks WidgetKit to re-render the complication immediately — the
    /// timeline policy is `.never` (see FitTrackComplication.swift), so
    /// without this explicit nudge the complication would only ever reflect
    /// whatever was on screen the first time it happened to render.
    static func save(score: Int, level: String) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }

        let payload: [String: Any] = [
            "score": score,
            "level": level,
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else { return }

        defaults.set(json, forKey: snapshotKey)
        WidgetCenter.shared.reloadTimelines(ofKind: complicationKind)
    }
}
