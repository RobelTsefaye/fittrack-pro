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

    init(activityType: HKWorkoutActivityType, isIndoor: Bool, durationMinutes: Int?, targetZone: Int?) {
        self.activityType = activityType
        self.isIndoor = activityType == .elliptical ? true : isIndoor
        self.durationMinutes = durationMinutes
        self.targetZone = targetZone
    }

    /// "running" | "cycling" | "elliptical" → HK type; nil for anything else.
    static func activityType(fromRaw raw: String) -> HKWorkoutActivityType? {
        switch raw {
        case "running": return .running
        case "cycling": return .cycling
        case "elliptical": return .elliptical
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
        self.init(
            activityType: type,
            isIndoor: message["isIndoor"] as? Bool ?? false,
            durationMinutes: dur > 0 ? dur : nil,
            targetZone: (1...5).contains(zone) ? zone : nil
        )
    }
}
