//
//  WatchModels.swift
//  FitTrackWatch Watch App
//
//  Codable mirrors of the phone app's plan/workout JSON shapes, used by the
//  standalone strength-training flow (session picker + set logging). Kept
//  intentionally minimal — only the fields the Watch UI actually renders —
//  since the phone-side sync (watch-workout-sync.ts) forwards the full API
//  response and we just decode what we need.
//

import Foundation

/// A trainable session within a plan, e.g. "Limbs" or "Torso" — freeform
/// text chosen by the user on the phone, not a fixed enum.
struct WatchPlanSession: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let order: Int
    let exercises: [WatchExerciseTemplate]
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

struct WatchPlanCatalogEntry: Codable, Identifiable {
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
    // Defaults to nil so existing memberwise-init call sites (mock data in
    // #Previews) don't need updating every time an optional field is added.
    let startedAt: String? = nil

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
    }
}

struct WatchWorkoutExercise: Codable, Identifiable, Hashable {
    let id: String
    let exercise: WatchExerciseInfo
    var sets: [WatchSet]
}

struct WatchSet: Codable, Identifiable, Hashable {
    let id: String
    let setNumber: Int
    var reps: Int?
    var weight: Double?
    var isCompleted: Bool
    /// Weight/reps from the last session that logged this same set number
    /// for this exercise (see `previous-logs` on the phone side). Nil until
    /// there's history for this exact exercise. Used only as the initial
    /// value for not-yet-logged sets — never overwrites an already-logged one.
    var previousWeight: Double?
    var previousReps: Int?
}
