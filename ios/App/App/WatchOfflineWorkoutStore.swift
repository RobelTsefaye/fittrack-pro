import Foundation

/// Durable native-only state for a workout started from the Watch while the
/// phone has no network. This lives outside WebView/IndexedDB so it remains
/// available to WatchConnectivity when the app UI is not running.
enum WatchOfflineWorkoutStore {
    private static let suite = "group.com.robeltsefaye.fittrackpro"
    private static let pendingKey = "watchPendingOfflineWorkout"
    private static let catalogKey = "watchCachedPlanCatalog"

    static func load() -> PendingOfflineWorkout? {
        guard let data = UserDefaults(suiteName: suite)?.data(forKey: pendingKey) else { return nil }
        return try? JSONDecoder().decode(PendingOfflineWorkout.self, from: data)
    }

    static func save(_ pending: PendingOfflineWorkout) {
        guard let data = try? JSONEncoder().encode(pending) else { return }
        UserDefaults(suiteName: suite)?.set(data, forKey: pendingKey)
    }

    static func clear() { UserDefaults(suiteName: suite)?.removeObject(forKey: pendingKey) }

    static func loadPlanCatalog() -> WatchCachedPlanCatalog? {
        guard let data = UserDefaults(suiteName: suite)?.data(forKey: catalogKey) else { return nil }
        return try? JSONDecoder().decode(WatchCachedPlanCatalog.self, from: data)
    }

    static func savePlanCatalog(_ json: String) {
        guard let data = json.data(using: .utf8),
              let catalog = try? JSONDecoder().decode(WatchCachedPlanCatalog.self, from: data),
              let encoded = try? JSONEncoder().encode(catalog) else { return }
        UserDefaults(suiteName: suite)?.set(encoded, forKey: catalogKey)
    }
}

struct PendingOfflineWorkout: Codable {
    let id: String
    let planSessionId: String
    let name: String
    let startedAt: String
    var workoutExercises: [OfflineWorkoutExercise]
    var restTimerAdjustSeconds: Double
    var queue: [WatchQueuedOp]
    var serverWorkoutId: String?
    var workoutExerciseIdMap: [String: String]
    var setIdMap: [String: String]
}

struct OfflineWorkoutExercise: Codable {
    let id: String
    let exercise: OfflineExerciseInfo
    var sets: [OfflineWorkoutSet]
}

struct OfflineExerciseInfo: Codable { let id: String; let name: String; let muscleGroup: String }

struct OfflineWorkoutSet: Codable {
    let id: String
    let setNumber: Int
    var weight: Double?
    var reps: Int?
    var isCompleted: Bool
    var completedAt: String?
}

struct WatchQueuedOp: Codable {
    enum Kind: String, Codable { case postWorkout, patchSet, completeWorkout, deleteWorkout }
    let kind: Kind
    var clientSetId: String?
    var weight: Double?
    var reps: Int?
    var isCompleted: Bool?
}

// Mirrors the compact catalog JSON already sent to the Watch. This app target
// cannot import WatchModels.swift from the watch target, so it owns a small
// Codable copy solely for constructing an offline workout skeleton.
struct WatchCachedPlanCatalog: Codable {
    let plans: [WatchCachedPlan]
    func session(id: String) -> WatchCachedPlanSession? {
        plans.lazy.flatMap(\.sessions).first { $0.id == id }
    }
}
struct WatchCachedPlan: Codable { let id: String; let name: String; let sessions: [WatchCachedPlanSession] }
struct WatchCachedPlanSession: Codable { let id: String; let name: String; let order: Int; let exercises: [WatchCachedPlanExercise] }
struct WatchCachedPlanExercise: Codable { let id: String; let targetSets: Int; let exercise: OfflineExerciseInfo }
