import Foundation
import HealthKit

/// Everything the user chose before starting a cardio session — flows
/// unchanged from every entry point (CardioConfigView and the finish screen
/// on the Watch, the phone's "startCardio" message, a workout configuration
/// handed over by `startWatchApp`) into WorkoutManager. Indoor/outdoor is a
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

    /// "running" | "cycling" | "elliptical" | "walking" → HK type; nil for anything else.
    static func activityType(fromRaw raw: String) -> HKWorkoutActivityType? {
        switch raw {
        case "running": return .running
        case "cycling": return .cycling
        case "elliptical": return .elliptical
        case "walking": return .walking
        default: return nil
        }
    }

    /// Parses a phone "startCardio" message or the queued "applyCardioPlan"
    /// user info (see WatchConnectivityPlugin on the phone side). nil when
    /// activityType is missing or unknown. Missing optionals mean
    /// "Frei"/"Keine" — the contract omits them instead of sending sentinels.
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

    /// Human title for live/summary screens ("Laufband", "Crosstrainer" …).
    var title: String { CardioKind(activityType: activityType, isIndoor: isIndoor)?.title ?? "Training" }
}

/// The cardio choices the Watch offers, named like the phone's buttons.
/// The first three are the gym options offered after a strength day.
enum CardioKind: String, CaseIterable, Identifiable {
    case indoorRun, indoorBike, elliptical, outdoorRun, outdoorBike, walk

    var id: String { rawValue }

    /// Offered on the finish screen after a day flagged "Cardio danach".
    static let afterStrength: [CardioKind] = [.indoorRun, .indoorBike, .elliptical]

    init?(activityType: HKWorkoutActivityType, isIndoor: Bool) {
        switch activityType {
        case .running: self = isIndoor ? .indoorRun : .outdoorRun
        case .cycling: self = isIndoor ? .indoorBike : .outdoorBike
        case .elliptical: self = .elliptical
        case .walking: self = .walk
        default: return nil
        }
    }

    var title: String {
        switch self {
        case .indoorRun: return "Laufband"
        case .indoorBike: return "Indoor-Rad"
        case .elliptical: return "Crosstrainer"
        case .outdoorRun: return "Laufen"
        case .outdoorBike: return "Radfahren"
        case .walk: return "Spazieren"
        }
    }

    var subtitle: String {
        switch self {
        case .indoorRun, .indoorBike, .elliptical: return "Indoor"
        case .outdoorRun, .outdoorBike: return "Draußen · Route"
        case .walk: return "Schritte"
        }
    }

    var icon: String {
        switch self {
        case .indoorRun, .outdoorRun: return "figure.run"
        case .indoorBike: return "figure.indoor.cycle"
        case .outdoorBike: return "figure.outdoor.cycle"
        case .elliptical: return "figure.elliptical"
        case .walk: return "figure.walk"
        }
    }

    var activityType: HKWorkoutActivityType {
        switch self {
        case .indoorRun, .outdoorRun: return .running
        case .indoorBike, .outdoorBike: return .cycling
        case .elliptical: return .elliptical
        case .walk: return .walking
        }
    }

    var isIndoor: Bool {
        switch self {
        case .indoorRun, .indoorBike, .elliptical: return true
        case .outdoorRun, .outdoorBike, .walk: return false
        }
    }

    var usesZones: Bool { self != .walk }

    func plan(minutes: Int? = nil, zone: Int? = nil, stepGoal: Int? = nil) -> CardioSessionPlan {
        CardioSessionPlan(
            activityType: activityType,
            isIndoor: isIndoor,
            durationMinutes: self == .walk ? nil : minutes,
            targetZone: self == .walk ? nil : zone,
            stepGoal: self == .walk ? stepGoal : nil
        )
    }
}
