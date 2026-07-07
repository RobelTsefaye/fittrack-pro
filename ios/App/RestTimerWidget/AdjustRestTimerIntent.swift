import AppIntents
import ActivityKit
import os

private let intentLog = Logger(
    subsystem: "com.robeltsefaye.fittrackpro.RestTimerWidget",
    category: "AdjustRestTimerIntent"
)

/**
 * Powers the -15s / +15s buttons inside the Live Activity (Dynamic Island
 * expanded view + Lock Screen). `LiveActivityIntent` lets it run and update
 * the Activity in place without opening the app.
 *
 * It mutates the running Activity directly (source of truth while the app is
 * backgrounded). The app re-reads that Activity's state on foreground (see
 * RestTimerActivityPlugin.handleAppDidBecomeActive) to resync the JS timer —
 * no App Group / shared storage needed.
 */
struct AdjustRestTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Adjust Rest Timer"
    static var description = IntentDescription("Adjusts the running rest timer by a number of seconds.")

    @Parameter(title: "Delta seconds")
    var deltaSeconds: Int

    init() {
        self.deltaSeconds = 0
    }

    init(deltaSeconds: Int) {
        self.deltaSeconds = deltaSeconds
    }

    func perform() async throws -> some IntentResult {
        intentLog.notice("perform() ENTERED, deltaSeconds=\(deltaSeconds, privacy: .public)")
        guard #available(iOS 16.1, *) else { return .result() }
        guard let activity = Activity<RestTimerWidgetAttributes>.activities.first else {
            intentLog.error("no running activity found — nothing to adjust")
            return .result()
        }
        intentLog.notice("found activity id=\(activity.id, privacy: .public)")

        let current = activity.content.state
        var next = current

        if let paused = current.pausedRemainingSeconds {
            next.pausedRemainingSeconds = max(0, paused + deltaSeconds)
        } else {
            next.endDate = current.endDate.addingTimeInterval(Double(deltaSeconds))
        }

        await activity.update(.init(state: next, staleDate: nil))
        intentLog.notice("activity updated ok")

        return .result()
    }
}
