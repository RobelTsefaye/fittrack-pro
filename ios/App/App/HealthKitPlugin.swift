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
            // HealthKit returns many small stage samples per night (one every
            // few minutes), not one aggregated entry like HAE sends. Two bugs
            // to avoid here:
            //
            // 1. Bucketing each sample independently by ITS OWN end time splits
            //    one continuous overnight sleep session across midnight — the
            //    23:11–23:59 portion lands on one calendar day, the 00:00–07:13
            //    portion on the next, and neither day sees the full night.
            //    Fix: cluster samples into SESSIONS first (samples close
            //    together in time belong to the same session, even across
            //    midnight), then attribute the ENTIRE session to the day of
            //    its final wake-up — matching how HAE treats a night as one
            //    entry with a single sleepEnd.
            //
            // 2. Multiple sources (Watch + iPhone + third-party apps) can each
            //    log their own overlapping session for the same night — naively
            //    merging all of them double-counts. Fix: pick one "best"
            //    session per night (prefer stage detail, else longest),
            //    the same way Apple's own Health app picks one source
            //    per night rather than merging.
            struct StageSample { let start: Date; let end: Date; let value: Int; let source: String }
            let stageSamples = samples.map {
                StageSample(start: $0.startDate, end: $0.endDate, value: $0.value, source: $0.sourceRevision.source.bundleIdentifier)
            }

            // Cluster per-source: consecutive samples belong to the same
            // session if the gap between one sample's end and the next's
            // start is ≤ 90 min (tolerates brief awakenings mid-night without
            // merging genuinely separate naps hours apart).
            let maxGapSeconds: TimeInterval = 90 * 60
            var sessions: [[StageSample]] = []
            for source in Set(stageSamples.map(\.source)) {
                let sorted = stageSamples.filter { $0.source == source }.sorted { $0.start < $1.start }
                var current: [StageSample] = []
                for sample in sorted {
                    if let last = current.last, sample.start.timeIntervalSince(last.end) > maxGapSeconds {
                        sessions.append(current)
                        current = []
                    }
                    current.append(sample)
                }
                if !current.isEmpty { sessions.append(current) }
            }

            struct SessionTotals { let day: String; let source: String; let deep: Double; let rem: Double; let asleep: Double; let end: Date }
            let sessionTotals: [SessionTotals] = sessions.compactMap { session in
                guard let source = session.first?.source, let sessionEnd = session.map(\.end).max() else { return nil }
                var deep = 0.0, rem = 0.0, asleep = 0.0
                for s in session {
                    let hours = s.end.timeIntervalSince(s.start) / 3600.0
                    switch s.value {
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue: deep += hours
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue: rem += hours
                    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                         HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                         HKCategoryValueSleepAnalysis.asleep.rawValue: asleep += hours
                    default: break
                    }
                }
                // The whole session belongs to the day it ENDS on (wake-up day),
                // not the day any individual sample within it ends on.
                return SessionTotals(day: dateKey(sessionEnd), source: source, deep: deep, rem: rem, asleep: asleep, end: sessionEnd)
            }

            // Pick the winning session per day: prefer stage detail (deep+rem > 0),
            // tie-break by total sleep duration. This also naturally picks the
            // main overnight session over a same-day nap in the rare case both
            // end up attributed to the same wake-up day.
            var bestByDay: [String: (deep: Double, rem: Double, total: Double, hasStages: Bool)] = [:]
            for session in sessionTotals {
                let total = session.deep + session.rem + session.asleep
                guard total > 0 else { continue }
                let hasStages = session.deep > 0 || session.rem > 0
                let candidate = (deep: session.deep, rem: session.rem, total: total, hasStages: hasStages)
                if let current = bestByDay[session.day] {
                    let candidateWins = (hasStages && !current.hasStages) || (hasStages == current.hasStages && total > current.total)
                    if candidateWins { bestByDay[session.day] = candidate }
                } else {
                    bestByDay[session.day] = candidate
                }
            }

            for (dayKey, best) in bestByDay {
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

        // Cumulative fields (steps, active/basal calories, exercise time) are
        // each independently tracked by BOTH the iPhone's motion coprocessor
        // AND the Apple Watch — a plain .cumulativeSum across all sources
        // adds them together instead of picking one, roughly doubling the
        // real value whenever the phone was carried while the watch was worn
        // (the normal case). Fix: use .separateBySource and take ONLY the
        // source whose name contains "Watch" — the Watch is the single
        // source of truth here, matching what the Watch's own Fitness app
        // displays. Days with no Watch-sourced data (e.g. Watch not worn/
        // charging) are simply skipped rather than falling back to the
        // phone, so the field stays absent instead of silently showing a
        // different device's number.
        func runWatchOnlySumQuery(id: HKQuantityTypeIdentifier, field: String, unit: HKUnit) {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
            group.enter()
            var interval = DateComponents()
            interval.day = 1
            let anchor = calendar.startOfDay(for: startDate)
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: now, options: .strictStartDate)
            let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate, options: [.cumulativeSum, .separateBySource], anchorDate: anchor, intervalComponents: interval)
            q.initialResultsHandler = { _, collection, _ in
                defer { group.leave() }
                var pending: [(String, Double)] = []
                collection?.enumerateStatistics(from: startDate, to: now) { stats, _ in
                    guard let sources = stats.sources else { return }
                    guard let watchSource = sources.first(where: { $0.name.localizedCaseInsensitiveContains("watch") }) else { return }
                    guard let value = stats.sumQuantity(for: watchSource)?.doubleValue(for: unit) else { return }
                    pending.append((dateKey(stats.startDate), value))
                }
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
            runWatchOnlySumQuery(id: id, field: field, unit: unit)
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
