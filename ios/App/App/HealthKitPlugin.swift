import Foundation
import Capacitor
import HealthKit

/**
 * Direct HealthKit bridge — replaces the Health Auto Export / iOS Shortcuts
 * pipeline entirely for users running the native app. Reads the same set of
 * vitals HAE was sending and returns them in the plain (non-HAE) shape our
 * `/api/health-data` POST handler already accepts, so no backend changes
 * were needed to support this — it's just a second way of feeding the same
 * endpoint.
 *
 * Aggregation semantics mirror transformHAE() in route.ts: cumulative
 * metrics (steps, activeCalories, exerciseMinutes) are summed per day,
 * instantaneous metrics (restingHeartRate, respiratoryRate, wristTemperature)
 * are averaged, and HRV takes the day's PEAK (see recovery.ts comment on why
 * peak beats average for HRV).
 */
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryDailySnapshots", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    // MARK: - Types we read

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        let quantityIds: [HKQuantityTypeIdentifier] = [
            .heartRate, .restingHeartRate, .heartRateVariabilitySDNN,
            .respiratoryRate, .stepCount, .activeEnergyBurned,
            .basalEnergyBurned, .appleExerciseTime, .vo2Max,
        ]
        for id in quantityIds {
            if let t = HKObjectType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        // Wrist temperature — Series 8+ only, guard for older watchOS/SDK.
        if #available(iOS 16.0, *), let t = HKObjectType.quantityType(forIdentifier: .appleSleepingWristTemperature) {
            types.insert(t)
        }
        return types
    }

    // MARK: - Plugin methods

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available on this device")
            return
        }
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": success])
        }
    }

    /// Returns one snapshot dict per calendar day, matching the field names
    /// of `snapshotSchema` in `/api/health-data/route.ts` (date, sleepDuration,
    /// sleepDeepMinutes, sleepRemMinutes, restingHeartRate, heartRateAvg, hrv,
    /// respiratoryRate, wristTemperature, steps, activeCalories,
    /// exerciseMinutes, calories, vo2Max).
    @objc func queryDailySnapshots(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 14
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: now) else {
            call.reject("Invalid range")
            return
        }

        let group = DispatchGroup()
        // HealthKit query completion handlers can fire concurrently on
        // different internal background queues. All mutation of `results`
        // is funneled through this single serial queue so writes from the
        // sleep query and the various HKStatisticsCollectionQuery callbacks
        // can never race each other.
        let resultsQueue = DispatchQueue(label: "com.robeltsefaye.fittrackpro.healthkit.results")
        var results: [String: [String: Any]] = [:] // dateKey -> record

        func dateKey(_ d: Date) -> String {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            f.timeZone = TimeZone.current
            return f.string(from: d)
        }

        func ensureRecord(_ key: String) {
            if results[key] == nil { results[key] = ["date": key] }
        }

        // Sleep — mirror the priority chain in route.ts: stage sum > asleep > inBed.
        group.enter()
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let sleepPredicate = HKQuery.predicateForSamples(withStart: startDate, end: now, options: .strictStartDate)
        let sleepQuery = HKSampleQuery(sampleType: sleepType, predicate: sleepPredicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            defer { group.leave() }
            guard let samples = samples as? [HKCategorySample] else { return }
            resultsQueue.sync {
            // HealthKit returns sleep samples from EVERY source that ever wrote
            // one for that night — Apple Watch, the iPhone's own sleep
            // detection, third-party apps (AutoSleep etc.). Naively summing
            // every sample's duration double- or triple-counts overlapping
            // nights when more than one source tracked the same sleep. Apple's
            // own Health app avoids this by picking one "best" source per
            // night rather than merging all of them — we do the same: group
            // samples by (day, source), then for each day keep only the
            // source with actual stage detail (deep/REM present), falling
            // back to whichever source logged the most total sleep if none
            // have stage detail.
            struct DaySource: Hashable { let day: String; let source: String }
            var byDaySource: [DaySource: (deep: Double, rem: Double, asleep: Double)] = [:]

            for s in samples {
                // Attribute sleep to the day it ENDS on (matches HAE's dateKey = sleepEnd behavior).
                let key = DaySource(day: dateKey(s.endDate), source: s.sourceRevision.source.bundleIdentifier)
                let hours = s.endDate.timeIntervalSince(s.startDate) / 3600.0
                var entry = byDaySource[key] ?? (0, 0, 0)
                switch s.value {
                case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                    entry.deep += hours
                case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                    entry.rem += hours
                case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                     HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                     HKCategoryValueSleepAnalysis.asleep.rawValue:
                    entry.asleep += hours
                default:
                    break
                }
                byDaySource[key] = entry
            }

            // Pick the winning source per day: prefer stage detail (deep+rem > 0),
            // tie-break by total sleep duration.
            var bestBySource: [String: (source: String, deep: Double, rem: Double, total: Double, hasStages: Bool)] = [:]
            for (key, entry) in byDaySource {
                let total = entry.deep + entry.rem + entry.asleep
                guard total > 0 else { continue }
                let hasStages = entry.deep > 0 || entry.rem > 0
                let candidate = (source: key.source, deep: entry.deep, rem: entry.rem, total: total, hasStages: hasStages)
                if let current = bestBySource[key.day] {
                    let candidateWins = (hasStages && !current.hasStages) || (hasStages == current.hasStages && total > current.total)
                    if candidateWins { bestBySource[key.day] = candidate }
                } else {
                    bestBySource[key.day] = candidate
                }
            }

            for (dayKey, best) in bestBySource {
                ensureRecord(dayKey)
                results[dayKey]?["sleepDuration"] = best.total
                results[dayKey]?["sleepDeepMinutes"] = Int(best.deep * 60)
                results[dayKey]?["sleepRemMinutes"] = Int(best.rem * 60)
            }
            } // resultsQueue.sync
        }
        store.execute(sleepQuery)

        // Quantity samples: average (instantaneous), sum (cumulative), or max (HRV).
        let avgFields: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.restingHeartRate, "restingHeartRate", HKUnit.count().unitDivided(by: .minute())),
            (.heartRate, "heartRateAvg", HKUnit.count().unitDivided(by: .minute())),
            (.respiratoryRate, "respiratoryRate", HKUnit.count().unitDivided(by: .minute())),
        ]
        let sumFields: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.stepCount, "steps", .count()),
            (.activeEnergyBurned, "activeCalories", .kilocalorie()),
            (.basalEnergyBurned, "calories", .kilocalorie()),
            (.appleExerciseTime, "exerciseMinutes", .minute()),
        ]
        let maxFields: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli)),
        ]

        func runStatsQuery(id: HKQuantityTypeIdentifier, field: String, unit: HKUnit, option: HKStatisticsOptions, extract: @escaping (HKStatistics) -> Double?) {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
            group.enter()
            var interval = DateComponents()
            interval.day = 1
            let anchor = calendar.startOfDay(for: startDate)
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: now, options: .strictStartDate)
            let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate, options: option, anchorDate: anchor, intervalComponents: interval)
            q.initialResultsHandler = { _, collection, _ in
                defer { group.leave() }
                var pending: [(String, Double)] = []
                collection?.enumerateStatistics(from: startDate, to: now) { stats, _ in
                    guard let value = extract(stats) else { return }
                    pending.append((dateKey(stats.startDate), value))
                }
                // Batch all of this query's writes into a single hop onto
                // resultsQueue instead of one hop per day — same
                // thread-safety guarantee, far fewer queue dispatches.
                resultsQueue.sync {
                    for (key, value) in pending {
                        ensureRecord(key)
                        results[key]?[field] = value
                    }
                }
            }
            store.execute(q)
        }

        for (id, field, unit) in avgFields {
            runStatsQuery(id: id, field: field, unit: unit, option: .discreteAverage) { $0.averageQuantity()?.doubleValue(for: unit) }
        }
        for (id, field, unit) in sumFields {
            runStatsQuery(id: id, field: field, unit: unit, option: .cumulativeSum) { $0.sumQuantity()?.doubleValue(for: unit) }
        }
        for (id, field, unit) in maxFields {
            runStatsQuery(id: id, field: field, unit: unit, option: .discreteMax) { $0.maximumQuantity()?.doubleValue(for: unit) }
        }

        // Wrist temperature (iOS 16+, Series 8+ only) — read as raw deviation
        // samples averaged per day. Uses the UCUM unit string "degC" rather
        // than a named HKUnit convenience method, since degreeCelsius() is
        // not guaranteed present across SDK versions the way
        // degreeFahrenheit() historically is.
        if #available(iOS 16.0, *), HKObjectType.quantityType(forIdentifier: .appleSleepingWristTemperature) != nil {
            let celsius = HKUnit(from: "degC")
            runStatsQuery(id: .appleSleepingWristTemperature, field: "wristTemperature", unit: celsius, option: .discreteAverage) { $0.averageQuantity()?.doubleValue(for: celsius) }
        }

        group.notify(queue: .main) {
            call.resolve(["data": Array(results.values)])
        }
    }

    /// Returns workouts in the same shape our HAE workout ingestion expects
    /// (`transformHAEWorkout` in route.ts), so the existing backend parsing
    /// and unit normalization is reused as-is.
    @objc func queryWorkouts(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 30
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: now) else {
            call.reject("Invalid range")
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: now, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let workouts = samples as? [HKWorkout] else {
                call.resolve(["data": []])
                return
            }
            let iso = ISO8601DateFormatter()
            let payload: [[String: Any]] = workouts.map { w in
                var dict: [String: Any] = [
                    "name": w.workoutActivityType.displayName,
                    "start": iso.string(from: w.startDate),
                    "end": iso.string(from: w.endDate),
                    "duration": w.duration,
                    "source": w.sourceRevision.source.name,
                ]
                if let distance = w.totalDistance {
                    dict["distance"] = ["qty": distance.doubleValue(for: .meter()), "units": "m"]
                }
                if let energy = w.totalEnergyBurned {
                    dict["activeEnergyBurned"] = ["qty": energy.doubleValue(for: .kilocalorie()), "units": "kcal"]
                }
                return dict
            }
            call.resolve(["data": payload])
        }
        store.execute(query)
    }
}

private extension HKWorkoutActivityType {
    /// Maps HealthKit's enum to the same English display names Apple Health's
    /// own export/HAE uses, so cardio.ts / cardio-config.ts type matching
    /// (Running, Cycling, "Traditional Strength Training", etc.) works
    /// unchanged regardless of whether the workout came via HAE or natively.
    var displayName: String {
        switch self {
        case .running: return "Running"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .traditionalStrengthTraining: return "Traditional Strength Training"
        case .functionalStrengthTraining: return "Functional Strength Training"
        case .hiking: return "Hiking"
        case .yoga: return "Yoga"
        case .highIntensityIntervalTraining: return "High Intensity Interval Training"
        case .rowing: return "Rowing"
        case .elliptical: return "Elliptical"
        case .stairClimbing: return "Stair Climbing"
        case .skatingSports: return "Skating"
        default: return "Other"
        }
    }
}
