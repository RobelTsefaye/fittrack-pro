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
 * It sends the same snapshots as an app launch (HealthKitPlugin.dailySnapshots
 * for today and yesterday: sleep sessions, vitals, steps, energy), triggered by
 * HealthKit background delivery when new data lands and by BGAppRefresh.
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

    // ── HealthKit background delivery ────────────────────────────────────────
    // BGAppRefresh alone runs when iOS feels like it (often not at all for an app
    // that is rarely opened), so what the Watch writes only reached the server on
    // the next app launch. Observer queries with background delivery wake the app
    // when new samples land: sleep when the night ends (the recovery score of the
    // morning), resting HR and HRV during the day, steps at most hourly. HealthKit
    // keeps its data locked while the iPhone is locked, so deliveries arrive after
    // the first unlock, and never for an app the user swiped away.
    private static let observedTypes: [(HKSampleType?, Bool)] = [
        (HKObjectType.categoryType(forIdentifier: .sleepAnalysis), true),      // true: always sync, no throttle
        (HKObjectType.quantityType(forIdentifier: .restingHeartRate), true),
        (HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN), false),
        (HKObjectType.quantityType(forIdentifier: .stepCount), false),
    ]
    private static var observersStarted = false
    private static let lastSyncKey = "healthBackgroundLastSync"

    /// Call at launch (iOS relaunches the app in the background for deliveries,
    /// so the queries must exist again before didFinishLaunching returns) and
    /// after a sync token was stored.
    static func startObservers() {
        guard !observersStarted, HKHealthStore.isHealthDataAvailable(),
              SyncTokenStore.loadForBackgroundUse() != nil else { return }
        observersStarted = true
        for case let (type?, important) in observedTypes {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                guard error == nil else { completion(); return }
                Task {
                    await syncIfDue(force: important)
                    completion()
                }
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: important ? .immediate : .hourly) { _, _ in }
        }
    }

    /// Steps and HRV often update together: one upload per 10 minutes is plenty.
    /// Sleep and resting HR always go through — they make the morning's score.
    private static func syncIfDue(force: Bool) async {
        let defaults = UserDefaults.standard
        let last = defaults.double(forKey: lastSyncKey)
        let now = Date().timeIntervalSince1970
        guard force || now - last > 10 * 60 else { return }
        defaults.set(now, forKey: lastSyncKey)
        _ = await performSync()
    }

    private static func performSync() async -> Bool {
        guard let token = SyncTokenStore.loadForBackgroundUse() else { return false }
        // The queue is independent of HealthKit and must get a chance to
        // replay even if HealthKit is temporarily unavailable.
        _ = await WatchAPIProxy.flushPendingOfflineWorkout()
        guard HKHealthStore.isHealthDataAvailable() else { return false }

        // Today and yesterday, built exactly like an app launch does (sleep sessions,
        // vitals, steps, energy) — HealthKitPlugin.dailySnapshots.
        let snapshots: [[String: Any]] = await withCheckedContinuation { cont in
            HealthKitPlugin.dailySnapshots(days: 2, store: store) { cont.resume(returning: $0 ?? []) }
        }
        guard !snapshots.isEmpty else { return true } // nothing readable (locked?), not an error
        guard let url = URL(string: "\(apiBaseURL)/api/health-data") else { return false }

        var success = true
        for snapshot in snapshots {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.httpBody = try? JSONSerialization.data(withJSONObject: snapshot)
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                if (response as? HTTPURLResponse).map({ $0.statusCode >= 400 }) ?? true { success = false }
            } catch {
                success = false
            }
        }
        if success {
            await refreshWidgetSnapshots(token: token)
        }
        return success
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
}
