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

    private func pushContext(_ call: CAPPluginCall) {
        do {
            try WCSession.default.updateApplicationContext(latestContext)
            call.resolve()
        } catch {
            call.reject("Failed to update Watch context: \(error.localizedDescription)")
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

    /// Handles Watch → phone requests (startSession/logSet/finishWorkout).
    /// The message must contain a "requestId" (String) chosen by the Watch;
    /// we stash the replyHandler and hand the message to JS via
    /// notifyListeners, which resolves it later via `respondToRequest`.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        guard let requestId = message["requestId"] as? String else {
            replyHandler(["error": "Missing requestId"])
            return
        }
        pendingReplies[requestId] = replyHandler
        notifyListeners("watchRequest", data: ["requestId": requestId, "message": message])
    }
}
