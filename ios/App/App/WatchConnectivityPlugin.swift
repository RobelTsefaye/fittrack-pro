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
        CAPPluginMethod(name: "updateWorkoutState", returnType: CAPPluginReturnPromise),
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

    /// Pushes the current exercise/set progress to the Watch. Expects
    /// exerciseName (String), currentSet (Int), totalSets (Int),
    /// weight (Double, optional), reps (Int, optional).
    @objc func updateWorkoutState(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        latestContext["active"] = true
        latestContext["exerciseName"] = call.getString("exerciseName") ?? ""
        latestContext["currentSet"] = call.getInt("currentSet") ?? 0
        latestContext["totalSets"] = call.getInt("totalSets") ?? 0
        latestContext["updatedAt"] = Date().timeIntervalSince1970
        if let weight = call.getDouble("weight") { latestContext["weight"] = weight } else { latestContext.removeValue(forKey: "weight") }
        if let reps = call.getInt("reps") { latestContext["reps"] = reps } else { latestContext.removeValue(forKey: "reps") }

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
        reply(payload)
        call.resolve()
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
