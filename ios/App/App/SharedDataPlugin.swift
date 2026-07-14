import Foundation
import Capacitor
import WidgetKit

/**
 * Writes small values into the shared App Group UserDefaults so widgets
 * (which run in a separate process with no network/auth access) can read
 * them without making their own API calls. Currently used for the
 * Recovery Score home-screen widget — see RecoveryScoreWidget.swift.
 */
@objc(SharedDataPlugin)
public class SharedDataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedDataPlugin"
    public let jsName = "SharedData"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setRecoverySnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNextWorkoutSnapshot", returnType: CAPPluginReturnPromise),
    ]

    private let suiteName = "group.com.robeltsefaye.fittrackpro"

    /// Expects score (Int), level ("high" | "mid" | "low" | "none").
    /// Stores as the JSON string RecoveryScoreWidget.swift reads, and asks
    /// WidgetKit to refresh so the home-screen tile updates without waiting
    /// for its own timeline schedule.
    @objc func setRecoverySnapshot(_ call: CAPPluginCall) {
        guard let score = call.getInt("score"), let level = call.getString("level") else {
            call.reject("Missing 'score' or 'level'")
            return
        }
        let payload: [String: Any] = [
            "score": score,
            "level": level,
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("Failed to encode snapshot")
            return
        }
        UserDefaults(suiteName: suiteName)?.set(json, forKey: "recoveryScoreSnapshot")
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    /// Erwartet streak (Int, >= 0). sessionName/planName sind optionale
    /// Strings — gesetzt, wenn eine nächste Session existiert; beide null,
    /// wenn der Nutzer keinen aktiven Plan hat, damit das Widget seinen
    /// "Kein Plan"-Zustand zeigt statt veralteter Daten eines früheren Plans.
    @objc func setNextWorkoutSnapshot(_ call: CAPPluginCall) {
        guard let streak = call.getInt("streak") else {
            call.reject("Missing 'streak'")
            return
        }
        let sessionName = call.getString("sessionName")
        let planName = call.getString("planName")

        var payload: [String: Any] = [
            "streak": streak,
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        payload["sessionName"] = sessionName as Any? ?? NSNull()
        payload["planName"] = planName as Any? ?? NSNull()
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("Failed to encode snapshot")
            return
        }
        UserDefaults(suiteName: suiteName)?.set(json, forKey: "nextWorkoutSnapshot")
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
