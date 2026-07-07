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
struct WatchActiveWorkout: Codable, Identifiable {
    var id: String { workoutId }
    let workoutId: String
    let name: String
    let workoutExercises: [WatchWorkoutExercise]

    enum CodingKeys: String, CodingKey {
        case workoutId = "id"
        case name
        case workoutExercises
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
}
