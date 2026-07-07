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
}
