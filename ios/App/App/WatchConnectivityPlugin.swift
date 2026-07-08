import Foundation
import Capacitor
import WatchConnectivity

/**
 * Bridges the JS workout state (workout-detail.tsx / rest-timer-context.tsx)
 * to the paired Apple Watch via WatchConnectivity, so the Watch app can show
 * "which set of which exercise is currently active on the phone" instead of
 * only running its own standalone workout session.
 *
 * Uses `updateApplicationContext` (not `sendMessage`) — it's the right tool
 * for "always show the latest state," works even if the Watch app isn't in
 * the foreground, and each new context replaces the previous one rather than
 * queuing (we never care about stale/intermediate set-progress values).
 */
@objc(WatchConnectivityPlugin)
public class WatchConnectivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchConnectivityPlugin"
    public let jsName = "WatchConnectivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncActiveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWorkoutState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushPlanCatalog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncRecoverySnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "respondToRequest", returnType: CAPPluginReturnPromise),
    ]

    /// The full application context dict, mutated in place and re-pushed on
    /// every call — `updateApplicationContext` replaces the *entire*
    /// dictionary each time, so separate features (live workout mirroring vs.
    /// the plan catalog) must merge into this shared dict instead of each
    /// building their own from scratch, or they'd silently clobber each
    /// other's keys.
    private var latestContext: [String: Any] = [:]

    /// Reply handlers for in-flight Watch → phone `sendMessage` requests,
    /// keyed by a requestId chosen by the Watch. JS resolves a request by
    /// calling `respondToRequest` with the same id.
    private var pendingReplies: [String: ([String: Any]) -> Void] = [:]

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": WCSession.isSupported()])
    }

    /// Pushes the full active workout (exercises + sets) to the Watch, so it
    /// can jump straight into the same logging UI used for Watch-initiated
    /// workouts instead of a separate summary screen. Expects `workoutJSON`
    /// (String, already JSON.stringify'd on the JS side — application
    /// contexts must be property-list-safe values).
    @objc func syncActiveWorkout(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        guard let workoutJSON = call.getString("workoutJSON") else {
            call.reject("Missing workoutJSON")
            return
        }
        latestContext["active"] = true
        latestContext["activeWorkout"] = workoutJSON
        latestContext["updatedAt"] = Date().timeIntervalSince1970

        pushContext(call)
    }

    /// Called when the workout ends/is cancelled, so the Watch stops showing
    /// stale "currently active" state.
    @objc func clearWorkoutState(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        latestContext["active"] = false
        latestContext.removeValue(forKey: "activeWorkout")
        pushContext(call)
    }

    /// Pushes the strength-training plan catalog (plans/sessions/exercises)
    /// to the Watch so it can offer a session picker without a network call.
    /// Expects `catalog` (JSON string, already serialized on the JS side —
    /// application contexts must be property-list-safe values, and a single
    /// String is the simplest way to hand over an arbitrary nested shape).
    @objc func pushPlanCatalog(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        guard let catalog = call.getString("catalog") else {
            call.reject("Missing catalog")
            return
        }
        latestContext["planCatalog"] = catalog
        latestContext["planCatalogUpdatedAt"] = Date().timeIntervalSince1970
        pushContext(call)
    }

    /// Pushes the Recovery Score to the Watch for HealthDashboardView —
    /// mirrors the same score/level SharedDataPlugin.swift already writes to
    /// the App Group for the phone's home-screen widget and this app's own
    /// watch-face complication, but those both read a *local* App Group,
    /// which the Watch (a separate device/process) can't see; WatchConnectivity
    /// is the only channel across the actual Watch↔iPhone boundary.
    @objc func syncRecoverySnapshot(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        guard let level = call.getString("level") else {
            call.reject("Missing level")
            return
        }
        latestContext["recoveryScore"] = call.getInt("score") ?? 0
        latestContext["recoveryLevel"] = level
        latestContext["recoveryUpdatedAt"] = Date().timeIntervalSince1970
        pushContext(call)
    }

    private func pushContext(_ call: CAPPluginCall) {
        if pushContextToWatch() {
            call.resolve()
        } else {
            call.reject("Failed to update Watch context")
        }
    }

    /// Same as `pushContext(_:)` but callable from the native request proxy
    /// below, which has no `CAPPluginCall` to resolve/reject (it isn't
    /// triggered by a JS call at all).
    @discardableResult
    private func pushContextToWatch() -> Bool {
        do {
            try WCSession.default.updateApplicationContext(latestContext)
            return true
        } catch {
            return false
        }
    }

    /// Resolves a pending Watch request (startSession/logSet/finishWorkout)
    /// with the JS-computed payload. Expects `requestId` (String) matching
    /// the id delivered via the "watchRequest" event, and `payload`
    /// (Object) — the reply handed back to the Watch's `sendMessage` call.
    @objc func respondToRequest(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId") else {
            call.reject("Missing requestId")
            return
        }
        guard let reply = pendingReplies.removeValue(forKey: requestId) else {
            call.reject("No pending request for id \(requestId)")
            return
        }
        let payload = call.getObject("payload") ?? [:]
        reply(sanitized(payload))
        call.resolve()
    }

    /// Strips `NSNull` values (from JSON `null` fields, e.g. an unlogged
    /// set's `weight`/`reps`) recursively out of a message before handing it
    /// to WatchConnectivity — `sendMessage`/`updateApplicationContext` only
    /// accept property-list-safe types, and `NSNull` isn't one, which fails
    /// the whole delivery with `WCErrorCodePayloadUnsupportedTypes` even
    /// though only one nested value was the problem.
    private func sanitized(_ dict: [String: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in dict {
            if let nested = value as? [String: Any] {
                result[key] = sanitized(nested)
            } else if let array = value as? [Any] {
                result[key] = array.compactMap { sanitizedValue($0) }
            } else if !(value is NSNull) {
                result[key] = value
            }
        }
        return result
    }

    private func sanitizedValue(_ value: Any) -> Any? {
        if value is NSNull { return nil }
        if let nested = value as? [String: Any] { return sanitized(nested) }
        if let array = value as? [Any] { return array.compactMap { sanitizedValue($0) } }
        return value
    }
}

extension WatchConnectivityPlugin: WCSessionDelegate {
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // No-op — activation state is checked lazily on each call above.
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate for the next paired Watch (e.g. after unpair/re-pair).
        session.activate()
    }

    /// Handles Watch → phone requests (startSession/logSet/finishWorkout/
    /// cancelWorkout). Prefers answering natively via WatchAPIProxy — a
    /// stored Bearer token means this works even if the phone app isn't
    /// open, unlike the JS bridge fallback below, which needs a live
    /// WKWebView to run watch-workout-sync.ts's fetch calls.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        guard let requestId = message["requestId"] as? String else {
            replyHandler(["error": "Missing requestId"])
            return
        }
        guard let type = message["type"] as? String else {
            replyHandler(["error": "Missing type"])
            return
        }

        if let token = SyncTokenStore.load() {
            Task {
                let (reply, contextUpdate) = await WatchAPIProxy.handle(type: type, message: message, token: token)
                if let contextUpdate {
                    switch contextUpdate {
                    case .setActiveWorkout(let json):
                        self.latestContext["active"] = true
                        self.latestContext["activeWorkout"] = json
                        self.latestContext["updatedAt"] = Date().timeIntervalSince1970
                    case .setRecovery(let score, let level):
                        self.latestContext["recoveryScore"] = score
                        self.latestContext["recoveryLevel"] = level
                        self.latestContext["recoveryUpdatedAt"] = Date().timeIntervalSince1970
                    case .clear:
                        self.latestContext["active"] = false
                        self.latestContext.removeValue(forKey: "activeWorkout")
                    }
                    self.pushContextToWatch()
                }
                replyHandler(reply)
            }
            return
        }

        // No token configured yet — fall back to the JS bridge, which only
        // works while the app is actually open and running.
        pendingReplies[requestId] = replyHandler
        notifyListeners("watchRequest", data: ["requestId": requestId, "message": message])
    }

    /// Fire-and-forget notifications from the Watch, sent via
    /// transferUserInfo (queued, survives the phone being unreachable —
    /// unlike sendMessage there's no reply to deliver, so it's the right
    /// channel for "something happened, catch up when you can").
    ///
    /// "cardioSaved": the Watch just saved a cardio HKWorkout. Push recent
    /// HealthKit workouts to the server right away so it shows up in the
    /// app immediately — otherwise it waits for the next foreground sync
    /// (rate-limited to 15 min). Falls back to the JS bridge when no token
    /// is stored; that path only works with the app open, same trade-off as
    /// the request handling above.
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard userInfo["type"] as? String == "cardioSaved" else { return }
        if let token = SyncTokenStore.load() {
            Task {
                // Small grace period: the workout the Watch just saved needs a
                // moment to replicate into the phone's HealthKit store. If
                // it's still not there after this, the next foreground sync
                // picks it up — this is best-effort acceleration, not the
                // only path.
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                await WatchAPIProxy.syncRecentWorkouts(token: token)
            }
        } else {
            notifyListeners("watchCardioSaved", data: [:])
        }
    }
}
