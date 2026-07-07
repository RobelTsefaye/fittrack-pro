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
    ]

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
        var context: [String: Any] = [
            "active": true,
            "exerciseName": call.getString("exerciseName") ?? "",
            "currentSet": call.getInt("currentSet") ?? 0,
            "totalSets": call.getInt("totalSets") ?? 0,
            "updatedAt": Date().timeIntervalSince1970,
        ]
        if let weight = call.getDouble("weight") { context["weight"] = weight }
        if let reps = call.getInt("reps") { context["reps"] = reps }

        do {
            try WCSession.default.updateApplicationContext(context)
            call.resolve()
        } catch {
            call.reject("Failed to update Watch context: \(error.localizedDescription)")
        }
    }

    /// Called when the workout ends/is cancelled, so the Watch stops showing
    /// stale "currently active" state.
    @objc func clearWorkoutState(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        do {
            try WCSession.default.updateApplicationContext(["active": false])
            call.resolve()
        } catch {
            call.reject("Failed to clear Watch context: \(error.localizedDescription)")
        }
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
}
