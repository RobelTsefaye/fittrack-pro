import Foundation
import UIKit
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
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise),
    ]

    // Type-erased storage so this property can exist on iOS versions below
    // 16.1 too (the typed `Activity<RestTimerWidgetAttributes>` computed
    // accessor below is what's actually gated by @available).
    private var _activity: Any?

    /// A start requested while the app wasn't foreground-active. ActivityKit
    /// only allows `Activity.request` from the foreground, so we stash the
    /// params here and retry on the next `didBecomeActive`.
    private var pendingStart: (endsAtMs: Double, title: String)?

    /// Picks up timer adjustments made from the Dynamic Island / Lock Screen
    /// +/- buttons (AdjustRestTimerIntent, runs in the widget extension
    /// process while this app may have been backgrounded) and forwards them
    /// to JS so `rest-timer-context.tsx` stays in sync.
    ///
    /// Rather than a shared App Group, we read the running Activity's current
    /// state directly on foreground — both this app and the widget extension
    /// share the same ActivityKit store, so whatever the +/- buttons wrote via
    /// `activity.update(...)` is visible here without any extra entitlement.
    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleAppDidBecomeActive() {
        guard #available(iOS 16.1, *) else { return }

        // 1) Flush a start that was deferred because we weren't foreground yet.
        if let pending = pendingStart {
            pendingStart = nil
            requestActivity(endsAtMs: pending.endsAtMs, title: pending.title, call: nil)
        }

        // 2) Resync JS from the running Activity's current state (reflects any
        //    -15s/+15s adjustments made from the Dynamic Island buttons).
        guard let activity = Activity<RestTimerWidgetAttributes>.activities.first else { return }
        let state = activity.content.state
        var data: [String: Any] = [:]
        if let paused = state.pausedRemainingSeconds {
            data["pausedRemainingSeconds"] = paused
        } else {
            data["endsAt"] = state.endDate.timeIntervalSince1970 * 1000
        }
        notifyListeners("adjustment", data: data)
    }

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

        // ActivityKit rejects `Activity.request` with "Target is not foreground"
        // unless the app is foreground-active. Auto-start (e.g. at workout begin)
        // can fire during a scene transition, so defer to didBecomeActive then.
        DispatchQueue.main.async {
            guard #available(iOS 16.1, *) else { call.resolve(); return }
            if UIApplication.shared.applicationState == .active {
                self.requestActivity(endsAtMs: endsAtMs, title: title, call: call)
            } else {
                self.pendingStart = (endsAtMs, title)
                call.resolve()
            }
        }
    }

    /// Ends any running rest-timer Activity and requests a fresh one. `call`
    /// is non-nil only for a direct JS `start` (so we can resolve/reject it);
    /// nil when replaying a deferred start from didBecomeActive.
    @available(iOS 16.1, *)
    private func requestActivity(endsAtMs: Double, title: String, call: CAPPluginCall?) {
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
            call?.resolve(["id": newActivity.id])
        } catch {
            call?.reject("Failed to start Live Activity: \(error.localizedDescription)")
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

    /// Ends the running Activity (timer stopped/dismissed/expired). Also drops
    /// any deferred start so a stop while backgrounded can't spawn an Activity
    /// on next foreground.
    @objc func end(_ call: CAPPluginCall) {
        pendingStart = nil
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
