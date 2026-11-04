//
//  WatchModels.swift
//  FitTrackWatch Watch App
//
//  Codable mirrors of the phone app's plan/workout JSON shapes, used by the
//  strength-training flow (session picker + set logging). Kept intentionally
//  minimal — only the fields the Watch UI actually renders — since the
//  phone-side sync (watch-workout-sync.ts / WatchAPIProxy.swift) forwards the
//  full shape and we just decode what we need.
//
//  Optional fields are declared `var x: T?` without a default value: that
//  way the memberwise initializer gives them `nil` (previews keep compiling)
//  AND the synthesized Decodable init still decodes them. A `let … = nil`
//  would silently be skipped by Decodable.
//

import Foundation

/// A trainable session within a plan, e.g. "Limbs" or "Torso" — freeform
/// text chosen by the user on the phone, not a fixed enum.
struct WatchPlanSession: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let order: Int
    let exercises: [WatchExerciseTemplate]
    /// Fixed training days, Monday-first (0 = Mo … 6 = So) — "Heute" on the
    /// home screen, same rule as the phone's workouts page.
    var weekdays: [Int]?
    /// Offer cardio after this day (PlanSession.cardioAfter).
    var cardioAfter: Bool?
}

struct WatchExerciseTemplate: Codable, Identifiable, Hashable {
    let id: String
    let targetSets: Int
    let exercise: WatchExerciseInfo
}

struct WatchExerciseInfo: Codable, Hashable {
    let id: String
    let name: String
    let muscleGroup: String
}

struct WatchPlanCatalogEntry: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let sessions: [WatchPlanSession]
}

/// Root shape pushed via `pushPlanCatalog` — `{ "plans": [...] }`.
struct WatchPlanCatalog: Codable {
    let plans: [WatchPlanCatalogEntry]
}

/// A started workout, as returned by `POST /plan-sessions/:id/start` →
/// `GET /workouts/:id`. Identifiable via `workoutId` so it can drive
/// `.navigationDestination(item:)`.
struct WatchActiveWorkout: Codable, Identifiable, Hashable {
    var id: String { workoutId }
    let workoutId: String
    /// Nullable on the phone (untitled workouts are common right after
    /// starting a session) — decoding must not fail just because this is
    /// missing/null, or the Watch silently never receives the workout at all.
    let name: String?
    var workoutExercises: [WatchWorkoutExercise]
    /// Epoch seconds the phone's rest timer ends at, whether started there
    /// directly or in reaction to a set completed on the Watch — nil when no
    /// rest timer is running. Self-expiring (compare against `Date()`), so
    /// there's no separate "cleared" signal to handle.
    var restTimerEndsAt: Double?
    /// ISO 8601 string of when the workout actually started (server clock,
    /// same value the phone's own elapsed-time display uses) — kept as a raw
    /// String rather than decoding straight to `Date` since Foundation's
    /// `.iso8601` JSONDecoder strategy doesn't handle the fractional-seconds
    /// format Prisma's serialized DateTime uses; see `startedAtDate`.
    var startedAt: String?
    /// The plan day this workout was started from.
    var planSessionId: String?
    /// The plan day asks for cardio afterwards — the finish screen then
    /// offers treadmill, indoor bike or elliptical.
    var cardioAfter: Bool?

    /// Parsed `startedAt`, used as the base for the Watch's own elapsed-time
    /// display so it doesn't drift from the phone's — both then compute
    /// "now minus this," instead of each starting its own local clock
    /// whenever its own session/page happened to become active.
    var startedAtDate: Date? {
        guard let startedAt else { return nil }
        return Self.isoFormatterWithFractionalSeconds.date(from: startedAt)
            ?? Self.isoFormatterPlain.date(from: startedAt)
    }

    private static let isoFormatterWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let isoFormatterPlain = ISO8601DateFormatter()

    enum CodingKeys: String, CodingKey {
        case workoutId = "id"
        case name
        case workoutExercises
        case restTimerEndsAt
        case startedAt
        case planSessionId
        case cardioAfter
    }
}

struct WatchWorkoutExercise: Codable, Identifiable, Hashable {
    let id: String
    let supersetGroup: Int?
    let exercise: WatchExerciseInfo
    var sets: [WatchSet]
    /// Target rep range from the plan (double progression), e.g. 8–12.
    var repMin: Int?
    var repMax: Int?
}

struct WatchSet: Codable, Identifiable, Hashable {
    let id: String
    let setNumber: Int
    var reps: Int?
    var weight: Double?
    var isCompleted: Bool
    // Defaults to false so older cached/preview payloads without this key
    // (added after isWarmup existed elsewhere) still decode.
    var isWarmup: Bool = false
    /// Weight/reps from the last session that logged this same set number
    /// for this exercise (see `previous-logs` on the phone side). Nil until
    /// there's history for this exact exercise. Used only as the initial
    /// value for not-yet-logged sets — never overwrites an already-logged one.
    var previousWeight: Double?
    var previousReps: Int?
    /// The phone's progression recommendation for this set (same numbers it
    /// shows next to the set) — the Watch's first choice for prefilling.
    var suggestedWeight: Double?
    var suggestedReps: Int?
}

// MARK: - Helpers shared by the logging screens

extension WatchWorkoutExercise {
    var completedCount: Int { sets.filter(\.isCompleted).count }
    var workingSetCount: Int { sets.filter { !$0.isWarmup }.count }

    /// "Ziel 8–12" when the plan has a rep range.
    var targetText: String? {
        guard let repMin, let repMax else { return nil }
        return repMin == repMax ? "Ziel \(repMin)" : "Ziel \(repMin)–\(repMax)"
    }

    /// Position among the working sets ("Satz 2 von 4"); nil for a warm-up.
    func workingPosition(of set: WatchSet) -> Int? {
        guard !set.isWarmup else { return nil }
        let working = sets.filter { !$0.isWarmup }
        return working.firstIndex(where: { $0.id == set.id }).map { $0 + 1 }
    }

    /// What the Watch proposes for a set, in the phone's order of preference:
    /// what was logged, the progression suggestion, last time, the set above
    /// (like the phone's "same as above"), else a neutral start.
    func proposal(for set: WatchSet) -> (weight: Double, reps: Int) {
        if set.isCompleted, let w = set.weight, let r = set.reps { return (w, r) }
        if let w = set.suggestedWeight, let r = set.suggestedReps { return (w, r) }
        if let w = set.previousWeight, let r = set.previousReps { return (w, r) }
        if let index = sets.firstIndex(where: { $0.id == set.id }), index > 0 {
            for above in sets[..<index].reversed() where above.weight != nil || above.reps != nil {
                return (above.weight ?? 20, above.reps ?? 10)
            }
        }
        return (set.weight ?? set.previousWeight ?? 20, set.reps ?? set.previousReps ?? 10)
    }
}

extension WatchActiveWorkout {
    var completedSetCount: Int { workoutExercises.reduce(0) { $0 + $1.completedCount } }
    var totalSetCount: Int { workoutExercises.reduce(0) { $0 + $1.sets.count } }

    /// Moved weight of the completed working sets (kg).
    var volume: Double {
        workoutExercises.reduce(0) { sum, exercise in
            sum + exercise.sets.reduce(0) { inner, set in
                guard set.isCompleted, !set.isWarmup, let w = set.weight, let r = set.reps else { return inner }
                return inner + w * Double(r)
            }
        }
    }

    /// The set to do next. Exercises in order; inside a superset the members
    /// alternate (A1, B1, A2, B2 …) — whichever member has done the fewest
    /// sets goes next, ties by position.
    var nextOpen: (exercise: WatchWorkoutExercise, set: WatchSet)? {
        guard let first = workoutExercises.first(where: { $0.sets.contains { !$0.isCompleted } }) else { return nil }
        var pick = first
        if let group = first.supersetGroup {
            let openMembers = workoutExercises.filter { $0.supersetGroup == group && $0.sets.contains { !$0.isCompleted } }
            if let fewest = openMembers.min(by: { $0.completedCount < $1.completedCount }) {
                pick = fewest
            }
        }
        guard let set = pick.sets.first(where: { !$0.isCompleted }) else { return nil }
        return (pick, set)
    }
}
