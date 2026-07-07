//
//  RestTimerWidgetAttributes.swift
//  RestTimerWidget
//
//  Shared between the RestTimerWidgetExtension target (Dynamic Island /
//  Lock Screen UI in RestTimerWidgetLiveActivity.swift) and the App target
//  (RestTimerActivityPlugin.swift, which starts/updates/ends the Activity
//  from JS). Both targets compile this exact file — see project.pbxproj:
//  it's picked up automatically for RestTimerWidgetExtension via the
//  RestTimerWidget/ synchronized folder group, and explicitly added to the
//  App target's Sources build phase under the same path.
//

import ActivityKit
import Foundation

struct RestTimerWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Wall-clock time the rest period ends. The Lock Screen / Dynamic
        /// Island countdown is rendered natively by iOS from `Date.now` vs.
        /// this value — no per-second updates from the app are needed while
        /// running, only when paused/resumed/adjusted.
        var endDate: Date
        /// Non-nil while paused: the frozen remaining seconds to show
        /// instead of a live countdown.
        var pausedRemainingSeconds: Int?
    }

    /// Short label shown above the countdown (e.g. "Pause" / exercise name).
    var title: String
}
