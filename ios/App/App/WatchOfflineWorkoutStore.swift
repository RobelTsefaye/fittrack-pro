import Foundation

/// Durable native-only state for a workout started from the Watch while the
/// phone has no network. This lives outside WebView/IndexedDB so it remains
/// available to WatchConnectivity when the app UI is not running.
enum WatchOfflineWorkoutStore {
    private static let suite = "group.com.robeltsefaye.fittrackpro"
    private static let pendingKey = "watchPendingOfflineWorkout"
    private static let terminalKey = "watchTerminalOfflineWorkouts"
    private static let recentCompletedKey = "watchRecentCompletedOfflineWorkouts"
    private static let rekeyMapKey = "watchWorkoutRekeyMap"
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

    /// Finished/cancelled workouts are no longer active, but must survive
    /// until their final server mutation has been replayed. Keeping them in
    /// a separate FIFO frees the single active slot for a new offline start.
    static func loadTerminalWorkouts() -> [PendingOfflineWorkout] {
        guard let data = UserDefaults(suiteName: suite)?.data(forKey: terminalKey) else { return [] }
        return (try? JSONDecoder().decode([PendingOfflineWorkout].self, from: data)) ?? []
    }

    static func saveTerminalWorkouts(_ workouts: [PendingOfflineWorkout]) {
        guard let data = try? JSONEncoder().encode(workouts) else { return }
        UserDefaults(suiteName: suite)?.set(data, forKey: terminalKey)
    }

    static func deferTerminalWorkout(_ workout: PendingOfflineWorkout) {
        var workouts = loadTerminalWorkouts()
        guard !workouts.contains(where: { $0.id == workout.id }) else { return }
        workouts.append(workout)
        saveTerminalWorkouts(workouts)
    }

    static func updateTerminalWorkout(_ workout: PendingOfflineWorkout) {
        var workouts = loadTerminalWorkouts()
        guard let index = workouts.firstIndex(where: { $0.id == workout.id }) else { return }
        workouts[index] = workout
        saveTerminalWorkouts(workouts)
    }

    static func removeTerminalWorkout(id: String) {
        saveTerminalWorkouts(loadTerminalWorkouts().filter { $0.id != id })
    }

    /// A completed Watch workout can finish replaying before the WebView has
    /// mounted its history page. Keep a tiny native receipt after a successful
    /// upload so that page can merge it with (or temporarily stand in for) a
    /// stale server/cache response instead of making the workout disappear.
    static func loadRecentCompletedWorkouts() -> [PendingOfflineWorkout] {
        guard let data = UserDefaults(suiteName: suite)?.data(forKey: recentCompletedKey) else { return [] }
        return (try? JSONDecoder().decode([PendingOfflineWorkout].self, from: data)) ?? []
    }

    static func archiveCompletedWorkout(_ workout: PendingOfflineWorkout) {
        var workouts = loadRecentCompletedWorkouts().filter { $0.id != workout.id }
        workouts.insert(workout, at: 0)
        // This is only a presentation backstop, not another replay queue.
        // Bound it so native storage never grows with workout history.
        if workouts.count > 20 { workouts.removeLast(workouts.count - 20) }
        guard let data = try? JSONEncoder().encode(workouts) else { return }
        UserDefaults(suiteName: suite)?.set(data, forKey: recentCompletedKey)
    }

    /// A cold app launch can flush and rekey a Watch workout (via
    /// OfflineWorkoutReachabilityMonitor, started from AppDelegate) before the
    /// WebView has even loaded, let alone registered its `watchWorkoutSynced`
    /// listener — that in-flight notifyListeners call is simply dropped, no
    /// one was listening yet. This durable log is the backstop: whichever
    /// screen next asks about the old local id (typically the workout detail
    /// page reopened from a stale route) can look it up here instead of
    /// treating a since-synced workout as a genuine 404.
    static func loadRekeyMap() -> [RekeyEntry] {
        guard let data = UserDefaults(suiteName: suite)?.data(forKey: rekeyMapKey) else { return [] }
        return (try? JSONDecoder().decode([RekeyEntry].self, from: data)) ?? []
    }

    static func recordRekey(localId: String, serverWorkoutId: String) {
        var entries = loadRekeyMap().filter { $0.localId != localId }
        entries.insert(RekeyEntry(localId: localId, serverWorkoutId: serverWorkoutId), at: 0)
        // Same bound as the completed-workout backstop above — this is a
        // lookup aid, not a growing history.
        if entries.count > 20 { entries.removeLast(entries.count - 20) }
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults(suiteName: suite)?.set(data, forKey: rekeyMapKey)
    }

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

    static func planCatalogJSON() -> String? {
        guard let catalog = loadPlanCatalog(),
              let data = try? JSONEncoder().encode(catalog) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// The phone editor works with the same lightweight workout shape as the
    /// web app. Persist its desired state here, rather than putting it in the
    /// WebView's IndexedDB queue: this native queue is the sole replay owner.
    @discardableResult
    static func updatePending(fromWorkoutJSON json: String) -> PendingOfflineWorkout? {
        guard var pending = load(),
              let data = json.data(using: .utf8),
              let editor = try? JSONDecoder().decode(OfflineEditorWorkout.self, from: data),
              editor.id == pending.id else { return nil }

        pending.name = editor.name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? editor.name!.trimmingCharacters(in: .whitespacesAndNewlines)
            : pending.name
        pending.workoutExercises = editor.workoutExercises.enumerated().map { index, exercise in
            OfflineWorkoutExercise(
                id: exercise.id,
                exercise: OfflineExerciseInfo(
                    id: exercise.exercise.id,
                    name: exercise.exercise.name,
                    muscleGroup: exercise.exercise.muscleGroup
                ),
                sets: exercise.sets.map { set in
                    OfflineWorkoutSet(
                        id: set.id,
                        setNumber: set.setNumber,
                        weight: set.weight,
                        reps: set.reps,
                        isWarmup: set.isWarmup,
                        isCompleted: set.isCompleted,
                        completedAt: set.completedAt
                    )
                }
            )
        }
        save(pending)
        return pending
    }
}

private struct OfflineEditorWorkout: Decodable {
    let id: String
    let name: String?
    let workoutExercises: [OfflineEditorExercise]
}
private struct OfflineEditorExercise: Decodable {
    let id: String
    let exercise: OfflineEditorExerciseInfo
    let sets: [OfflineEditorSet]
}
private struct OfflineEditorExerciseInfo: Decodable {
    let id: String
    let name: String
    let muscleGroup: String
}
private struct OfflineEditorSet: Decodable {
    let id: String
    let setNumber: Int
    let reps: Int?
    let weight: Double?
    let isWarmup: Bool
    let isCompleted: Bool
    let completedAt: String?
}

struct PendingOfflineWorkout: Codable {
    let id: String
    let planSessionId: String
    var name: String
    let startedAt: String
    var endedAt: String?
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
    var isWarmup: Bool
    var isCompleted: Bool
    var completedAt: String?

    init(id: String, setNumber: Int, weight: Double?, reps: Int?, isWarmup: Bool = false, isCompleted: Bool, completedAt: String?) {
        self.id = id
        self.setNumber = setNumber
        self.weight = weight
        self.reps = reps
        self.isWarmup = isWarmup
        self.isCompleted = isCompleted
        self.completedAt = completedAt
    }

    // Queues written before warm-up sets became editable have no `isWarmup`
    // key. Decode those durable records as ordinary working sets instead of
    // dropping an in-progress offline workout on app upgrade.
    private enum CodingKeys: String, CodingKey { case id, setNumber, weight, reps, isWarmup, isCompleted, completedAt }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        setNumber = try values.decode(Int.self, forKey: .setNumber)
        weight = try values.decodeIfPresent(Double.self, forKey: .weight)
        reps = try values.decodeIfPresent(Int.self, forKey: .reps)
        isWarmup = try values.decodeIfPresent(Bool.self, forKey: .isWarmup) ?? false
        isCompleted = try values.decode(Bool.self, forKey: .isCompleted)
        completedAt = try values.decodeIfPresent(String.self, forKey: .completedAt)
    }
}

struct WatchQueuedOp: Codable {
    enum Kind: String, Codable { case postWorkout, patchSet, completeWorkout, deleteWorkout }
    let kind: Kind
    var clientSetId: String?
    var weight: Double?
    var reps: Int?
    var isCompleted: Bool?
}

struct RekeyEntry: Codable {
    let localId: String
    let serverWorkoutId: String
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
