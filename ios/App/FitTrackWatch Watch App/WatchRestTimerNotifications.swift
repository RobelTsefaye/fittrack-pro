//
//  WatchRestTimerNotifications.swift
//  FitTrackWatch Watch App
//
//  A local (non-push) notification for the rest timer's expiry, scheduled
//  directly on the Watch — mirrors local-notifications.ts on the phone side.
//
//  RestTimerRow's own haptic (WKInterfaceDevice.play(.notification)) only
//  fires while that view is actually on screen and ticking, which requires
//  the Watch app to be foreground-active; a backgrounded/screen-off Watch
//  never gets there, so the countdown could reach zero in total silence
//  even though the phone's own local notification (see WatchAPIProxy.swift)
//  fired correctly — reported as "notification comes but the Watch doesn't
//  vibrate." A scheduled UNNotificationRequest is delivered by watchOS
//  itself regardless of app state, with a haptic tap built in.
//

import Foundation
import UserNotifications

enum WatchRestTimerNotifications {
    private static let identifier = "watch-rest-timer"
    private static var permissionRequested = false

    /// Schedules (or reschedules, replacing any pending one) a "rest over"
    /// notification for `endsAt` (epoch seconds). No-ops if it's already in
    /// the past — nothing to notify about.
    static func schedule(endsAt: Double) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        let interval = endsAt - Date().timeIntervalSince1970
        guard interval > 0 else { return }

        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional:
                addRequest(interval: interval)
            case .notDetermined:
                // Only prompt once per app launch — declining shouldn't
                // re-prompt on every single set completed.
                guard !permissionRequested else { return }
                permissionRequested = true
                center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    guard granted else { return }
                    addRequest(interval: interval)
                }
            default:
                break
            }
        }
    }

    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }

    private static func addRequest(interval: TimeInterval) {
        let content = UNMutableNotificationContent()
        content.title = "Pause vorbei"
        content.body = "Zeit fürs nächste Set"
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }
}
