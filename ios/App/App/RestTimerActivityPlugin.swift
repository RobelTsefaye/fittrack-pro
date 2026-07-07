import Foundation
import Capacitor
import ActivityKit

/**
 * Bridges the JS rest timer (rest-timer-context.tsx) to a Live Activity /
 * Dynamic Island countdown. iOS renders the actual per-second countdown
 * natively from `endDate` (via `Text(timerInterval:countsDown:)` in
 * RestTimerWidgetLiveActivity.swift) — we only start/update/end the
 * Activity, never tick it ourselves from JS.
 *
 * RestTimerWidgetAttributes is defined in
 * RestTimerWidget/RestTimerWidgetAttributes.swift and is compiled into BOTH
 * this app target and the RestTimerWidgetExtension target (see
 * project.pbxproj) so both sides share the exact same type.
 */
@objc(RestTimerActivityPlugin)
public class RestTimerActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestTimerActivityPlugin"
    public let jsName = "RestTimerActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    // Type-erased storage so this property can exist on iOS versions below
    // 16.1 too (the typed `Activity<RestTimerWidgetAttributes>` computed
    // accessor below is what's actually gated by @available).
    private var _activity: Any?

    @available(iOS 16.1, *)
    private var activity: Activity<RestTimerWidgetAttributes>? {
        get { _activity as? Activity<RestTimerWidgetAttributes> }
        set { _activity = newValue }
    }

    /// Starts a new Live Activity. Expects `endsAt` (ms epoch) and optional
    /// `title`. Ends any previously running rest-timer Activity first, so
    /// only one is ever shown.
    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled in system settings")
            return
        }
        guard let endsAtMs = call.getDouble("endsAt") else {
            call.reject("Missing 'endsAt' (ms epoch)")
            return
        }
        let title = call.getString("title") ?? "Pause"
        let endDate = Date(timeIntervalSince1970: endsAtMs / 1000)

        if let existing = activity {
            Task { await existing.end(nil, dismissalPolicy: .immediate) }
            activity = nil
        }

        let attributes = RestTimerWidgetAttributes(title: title)
        let state = RestTimerWidgetAttributes.ContentState(endDate: endDate, pausedRemainingSeconds: nil)
        do {
            let newActivity = try Activity<RestTimerWidgetAttributes>.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
            activity = newActivity
            call.resolve(["id": newActivity.id])
        } catch {
            call.reject("Failed to start Live Activity: \(error.localizedDescription)")
        }
    }

    /// Updates the running Activity — e.g. after pause (pass
    /// `pausedRemainingSeconds`) or resume/adjust (pass a new `endsAt`).
    /// No-ops silently if no Activity is running (e.g. web/PWA or pre-16.1).
    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let activity = activity else {
            call.resolve()
            return
        }
        let pausedRemaining = call.getInt("pausedRemainingSeconds")
        let endsAtMs = call.getDouble("endsAt")
        let endDate = endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        let state = RestTimerWidgetAttributes.ContentState(endDate: endDate, pausedRemainingSeconds: pausedRemaining)
        Task {
            await activity.update(.init(state: state, staleDate: nil))
            call.resolve()
        }
    }

    /// Ends the running Activity (timer stopped/dismissed/expired).
    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let activity = activity else {
            call.resolve()
            return
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            self.activity = nil
            call.resolve()
        }
    }
}
