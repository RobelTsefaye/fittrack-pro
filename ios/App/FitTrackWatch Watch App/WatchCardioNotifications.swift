import Foundation
import UserNotifications

enum WatchCardioNotifications {
    private static let identifier = "watch-cardio-complete"
    private static let stepGoalIdentifier = "watch-step-goal"
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

    static func notifyStepGoalReached(goal: Int) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional:
                addStepGoalRequest(goal: goal)
            case .notDetermined:
                guard !permissionRequested else { return }
                permissionRequested = true
                center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    guard granted else { return }
                    addStepGoalRequest(goal: goal)
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

    private static func addStepGoalRequest(goal: Int) {
        let content = UNMutableNotificationContent()
        content.title = "Schrittziel erreicht"
        content.body = "\(goal) Schritte geschafft — weiter so!"
        content.sound = .default
        let request = UNNotificationRequest(identifier: stepGoalIdentifier, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
