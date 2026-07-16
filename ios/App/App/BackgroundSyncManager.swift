import Foundation
import BackgroundTasks
import HealthKit
import WidgetKit

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
        guard SyncTokenStore.loadForBackgroundUse() != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        // iOS treats this as a best-effort earliest time, not a guaranteed
        // hourly schedule. Foreground/resume sync remains the reliable path.
        request.earliestBeginDate = Date(timeIntervalSinceNow: 1 * 60 * 60)
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
        guard let token = SyncTokenStore.loadForBackgroundUse() else { return false }
        // The queue is independent of HealthKit and must get a chance to
        // replay even if HealthKit is temporarily unavailable.
        _ = await WatchAPIProxy.flushPendingOfflineWorkout()
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
            let success = (response as? HTTPURLResponse).map { $0.statusCode < 400 } ?? false
            if success {
                Task { await refreshWidgetSnapshots(token: token) }
            }
            return success
        } catch {
            return false
        }
    }

    private static func refreshWidgetSnapshots(token: String) async {
        async let recovery = fetchRecoverySnapshot(token: token)
        async let workout = fetchNextWorkoutSnapshot(token: token)

        var updated = false
        if let snapshot = await recovery {
            updated = writeSnapshot(snapshot, forKey: "recoveryScoreSnapshot") || updated
        }
        if let snapshot = await workout {
            updated = writeSnapshot(snapshot, forKey: "nextWorkoutSnapshot") || updated
        }
        if updated, #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    private static func fetchRecoverySnapshot(token: String) async -> [String: Any]? {
        struct Response: Decodable {
            struct Data: Decodable { let score: Int; let level: String }
            let data: Data
        }
        guard let response: Response = await get("/api/health/recovery", token: token) else { return nil }
        return [
            "score": response.data.score,
            "level": response.data.level,
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
    }

    private static func fetchNextWorkoutSnapshot(token: String) async -> [String: Any]? {
        struct Response: Decodable {
            struct Data: Decodable {
                struct Payload: Decodable {
                    struct Summary: Decodable { let workoutStreakDays: Int }
                    struct NextSession: Decodable { let sessionId: String; let sessionName: String; let planName: String }
                    let summary: Summary
                    let nextSession: NextSession?
                }
                let payload: Payload
            }
            let data: Data
        }
        guard let response: Response = await get("/api/dashboard/client-payload", token: token) else { return nil }
        let nextSession = response.data.payload.nextSession
        return [
            "streak": response.data.payload.summary.workoutStreakDays,
            "sessionName": nextSession?.sessionName as Any? ?? NSNull(),
            "planName": nextSession?.planName as Any? ?? NSNull(),
            "sessionId": nextSession?.sessionId as Any? ?? NSNull(),
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
    }

    private static func get<T: Decodable>(_ path: String, token: String) async -> T? {
        guard let url = URL(string: "\(apiBaseURL)\(path)") else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode < 400 else { return nil }
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    private static func writeSnapshot(_ snapshot: [String: Any], forKey key: String) -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: snapshot),
              let json = String(data: data, encoding: .utf8) else { return false }
        UserDefaults(suiteName: "group.com.robeltsefaye.fittrackpro")?.set(json, forKey: key)
        return true
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
