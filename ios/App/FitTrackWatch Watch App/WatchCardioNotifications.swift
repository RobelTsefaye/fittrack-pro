import Foundation
import UserNotifications

enum WatchCardioNotifications {
    private static let identifier = "watch-cardio-complete"
    private static var permissionRequested = false

    static func notifyCardioComplete() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional:
                addRequest()
            case .notDetermined:
                guard !permissionRequested else { return }
                permissionRequested = true
                center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    guard granted else { return }
                    addRequest()
                }
            default:
                break
            }
        }
    }

    private static func addRequest() {
        let content = UNMutableNotificationContent()
        content.title = "Training beendet"
        content.body = "Zieldauer erreicht — Workout gespeichert"
        content.sound = .default
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
