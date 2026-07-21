import Foundation
import HealthKit

/// Everything the user chose before starting a cardio session — flows
/// unchanged from both entry points (CardioConfigView on the Watch, the
/// phone's "startCardio" message) into WorkoutManager. Indoor/outdoor is a
/// stored choice here, never derived from the activity type: indoor running
/// and indoor cycling are the whole point.
struct CardioSessionPlan: Equatable {
    let activityType: HKWorkoutActivityType
    let isIndoor: Bool
    /// nil = "Frei" (no fixed duration, no halftime, no auto-stop).
    let durationMinutes: Int?
    /// nil = "Keine" (no target zone, no enter/leave alerts). Else 1...5.
    let targetZone: Int?
    /// Only for Spazieren — nil for every other cardio type.
    let stepGoal: Int?

    init(activityType: HKWorkoutActivityType, isIndoor: Bool, durationMinutes: Int?, targetZone: Int?, stepGoal: Int?) {
        self.activityType = activityType
        self.isIndoor = activityType == .elliptical ? true : isIndoor
        self.durationMinutes = durationMinutes
        self.targetZone = targetZone
        self.stepGoal = stepGoal
    }

    /// "running" | "cycling" | "elliptical" → HK type; nil for anything else.
    static func activityType(fromRaw raw: String) -> HKWorkoutActivityType? {
        switch raw {
        case "running": return .running
        case "cycling": return .cycling
        case "elliptical": return .elliptical
        case "walking": return .walking
        default: return nil
        }
    }

    /// Parses a phone "startCardio" message (see WatchConnectivityPlugin's
    /// startCardioSession on the phone side). nil when activityType is
    /// missing or unknown. Missing optionals mean "Frei"/"Keine" — the
    /// message contract omits them instead of sending sentinels.
    init?(message: [String: Any]) {
        guard let raw = message["activityType"] as? String,
              let type = Self.activityType(fromRaw: raw) else { return nil }
        let dur = message["durationMinutes"] as? Int ?? 0
        let zone = message["targetZone"] as? Int ?? 0
        let goal = message["stepGoal"] as? Int ?? 0
        self.init(
            activityType: type,
            isIndoor: message["isIndoor"] as? Bool ?? false,
            durationMinutes: dur > 0 ? dur : nil,
            targetZone: (1...5).contains(zone) ? zone : nil,
            stepGoal: goal > 0 ? goal : nil
        )
    }
}
