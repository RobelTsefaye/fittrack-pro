import Foundation
import BackgroundTasks
import HealthKit

/**
 * Periodic background HealthKit sync so vitals stay reasonably fresh even
 * when the user hasn't opened the app in a while. iOS decides exactly when
 * to actually run this (never guaranteed, never precisely on schedule — it
 * favors times the device is charging + on WiFi), so this is a "best effort
 * top-up," not a replacement for the foreground sync in
 * native-health-sync.tsx which remains the primary, reliable path.
 *
 * Deliberately scoped down vs. the full HealthKitPlugin.swift sync: just
 * today's steps/active calories/resting HR/HRV via simple statistics
 * queries, no sleep-session clustering, no Watch-only source filtering. The
 * fuller, source-accurate sync still happens on next foreground. This keeps
 * the background task fast and low-risk to run without a live app UI.
 *
 * Background tasks have no WKWebView, so no session cookie — auth uses the
 * user's API token (Settings → API Tokens) stored in the Keychain via
 * SyncTokenStore, same Bearer-token auth path /api/health-data already
 * supports for Health Auto Export.
 */
enum BackgroundSyncManager {
    static let taskIdentifier = "com.robeltsefaye.fittrackpro.healthsync"
    private static let apiBaseURL = "https://fittrack-pro-ashen.vercel.app"
    private static let store = HKHealthStore()

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            handle(task: task as! BGAppRefreshTask)
        }
    }

    /// Call after every successful token save and on app background — BGTask
    /// requests are one-shot, each run must re-schedule the next one.
    static func schedule() {
        guard SyncTokenStore.load() != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 60 * 60) // ~4h minimum gap
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(task: BGAppRefreshTask) {
        schedule() // queue the next run regardless of this one's outcome

        let work = Task {
            let success = await performSync()
            task.setTaskCompleted(success: success)
        }
        task.expirationHandler = { work.cancel() }
    }

    private static func performSync() async -> Bool {
        guard let token = SyncTokenStore.load() else { return false }
        guard HKHealthStore.isHealthDataAvailable() else { return false }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        var snapshot: [String: Any] = [
            "date": ISO8601DateFormatter().string(from: startOfDay).prefix(10).description,
        ]

        async let steps = sum(.stepCount, unit: .count(), since: startOfDay)
        async let activeCalories = sum(.activeEnergyBurned, unit: .kilocalorie(), since: startOfDay)
        async let restingHR = average(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), since: startOfDay)
        async let hrv = average(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), since: startOfDay)

        if let v = await steps { snapshot["steps"] = v }
        if let v = await activeCalories { snapshot["activeCalories"] = v }
        if let v = await restingHR { snapshot["restingHeartRate"] = v }
        if let v = await hrv { snapshot["hrv"] = v }

        guard snapshot.count > 1 else { return true } // nothing new, not an error

        guard let url = URL(string: "\(apiBaseURL)/api/health-data") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: snapshot)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse).map { $0.statusCode < 400 } ?? false
        } catch {
            return false
        }
    }

    private static func sum(_ id: HKQuantityTypeIdentifier, unit: HKUnit, since start: Date) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        return await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                continuation.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private static func average(_ id: HKQuantityTypeIdentifier, unit: HKUnit, since start: Date) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        return await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, stats, _ in
                continuation.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }
}
