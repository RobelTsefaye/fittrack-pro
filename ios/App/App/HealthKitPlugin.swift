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
            .dietaryEnergyConsumed, .dietaryProtein, .dietaryCarbohydrates,
            .dietaryFatTotal, .dietaryFiber, .dietarySugar, .dietarySodium,
            .dietaryCaffeine, .dietaryWater,
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
    /// exerciseMinutes, calories, vo2Max, and nutrition intake fields).
    @objc func queryDailySnapshots(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 90
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
        var stepsToSubtract: [String: Double] = [:]

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

            struct SessionTotals { let day: String; let source: String; let deep: Double; let rem: Double; let asleep: Double; let inBed: Double; let start: Date; let end: Date }
            let sessionTotals: [SessionTotals] = sessions.compactMap { session in
                guard let source = session.first?.source,
                      let sessionEnd = session.map(\.end).max(),
                      let sessionStart = session.map(\.start).min() else { return nil }
                var deep = 0.0, rem = 0.0, asleep = 0.0, inBed = 0.0
                for s in session {
                    let hours = s.end.timeIntervalSince(s.start) / 3600.0
                    switch s.value {
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue: deep += hours
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue: rem += hours
                    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                         HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                         HKCategoryValueSleepAnalysis.asleep.rawValue: asleep += hours
                    case HKCategoryValueSleepAnalysis.inBed.rawValue: inBed += hours
                    default: break
                    }
                }
                // The whole session belongs to the day it ENDS on (wake-up day),
                // not the day any individual sample within it ends on.
                return SessionTotals(day: dateKey(sessionEnd), source: source, deep: deep, rem: rem, asleep: asleep, inBed: inBed, start: sessionStart, end: sessionEnd)
            }

            // Pick the winning session per day: prefer stage detail (deep+rem > 0),
            // tie-break by total sleep duration. This also naturally picks the
            // main overnight session over a same-day nap in the rare case both
            // end up attributed to the same wake-up day.
            var bestByDay: [String: (deep: Double, rem: Double, total: Double, hasStages: Bool, start: Date, end: Date)] = [:]
            for session in sessionTotals {
                // Some sources provide only an in-bed interval, while Apple
                // Watch supplies sleep stages. Prefer the stage/asleep total
                // whenever available; otherwise retain the in-bed interval as
                // the documented final fallback instead of dropping the night.
                let stagedTotal = session.deep + session.rem + session.asleep
                let total = stagedTotal > 0 ? stagedTotal : session.inBed
                guard total > 0 else { continue }
                let hasStages = session.deep > 0 || session.rem > 0
                let candidate = (deep: session.deep, rem: session.rem, total: total, hasStages: hasStages, start: session.start, end: session.end)
                if let current = bestByDay[session.day] {
                    let candidateWins = (hasStages && !current.hasStages) || (hasStages == current.hasStages && total > current.total)
                    if candidateWins { bestByDay[session.day] = candidate }
                } else {
                    bestByDay[session.day] = candidate
                }
            }

            let bedtimeFormatter: DateFormatter = {
                let f = DateFormatter()
                f.dateFormat = "HH:mm"
                f.timeZone = TimeZone.current
                return f
            }()

            for (dayKey, best) in bestByDay {
                ensureRecord(dayKey)
                results[dayKey]?["sleepDuration"] = best.total
                results[dayKey]?["sleepDeepMinutes"] = Int(best.deep * 60)
                results[dayKey]?["sleepRemMinutes"] = Int(best.rem * 60)
                // The session's earliest sample start — same "when did this
                // night's sleep begin" definition the old Health Auto Export
                // import used, just computed straight from the sleep session
                // instead of relying on a third-party app to have sent it.
                results[dayKey]?["sleepBedtime"] = bedtimeFormatter.string(from: best.start)
                results[dayKey]?["sleepWakeTime"] = bedtimeFormatter.string(from: best.end)
            }
            } // resultsQueue.sync
        }
        store.execute(sleepQuery)

        // Quantity samples: average (instantaneous), sum (cumulative), or max (HRV).
        let avgFields: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.restingHeartRate, "restingHeartRate", HKUnit.count().unitDivided(by: .minute())),
            (.heartRate, "heartRateAvg", HKUnit.count().unitDivided(by: .minute())),
            (.respiratoryRate, "respiratoryRate", HKUnit.count().unitDivided(by: .minute())),
            // HealthKit's canonical VO₂max dimension is ml/(kg*min). The
            // slash-separated spelling used previously is a different unit
            // expression; passing it to `doubleValue(for:)` can raise an
            // Objective-C exception and terminate the app.
            (.vo2Max, "vo2Max", HKUnit(from: "ml/kg*min")),
        ]
        let sumFields: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.stepCount, "steps", .count()),
            (.activeEnergyBurned, "activeCalories", .kilocalorie()),
            (.basalEnergyBurned, "calories", .kilocalorie()),
            (.appleExerciseTime, "exerciseMinutes", .minute()),
            (.dietaryEnergyConsumed, "dietaryCalories", .kilocalorie()),
            (.dietaryProtein, "protein", .gram()),
            (.dietaryCarbohydrates, "carbs", .gram()),
            (.dietaryFatTotal, "fat", .gram()),
            (.dietaryFiber, "fiber", .gram()),
            (.dietarySugar, "sugar", .gram()),
            (.dietarySodium, "sodium", .gramUnit(with: .milli)),
            (.dietaryCaffeine, "caffeine", .gramUnit(with: .milli)),
            (.dietaryWater, "water", .literUnit(with: .milli)),
        ]
        let maxFields: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli)),
        ]

        func runStatsQuery(id: HKQuantityTypeIdentifier, field: String, unit: HKUnit, option: HKStatisticsOptions, extract: @escaping (HKStatistics) -> Double?) {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
            // `HKQuantity.doubleValue(for:)` raises an Objective-C exception
            // for incompatible units, which Swift cannot catch. Skip only
            // this metric rather than risking the entire native process.
            guard type.is(compatibleWith: unit) else { return }
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

        // Same shape as runStatsQuery but with noon-to-noon day buckets
        // instead of midnight-to-midnight — for overnight vitals Apple
        // timestamps near bedtime (see call site comment). The bucket
        // spanning noon-of-day-N to noon-of-day-N+1 is labeled by its
        // END (noon of day N+1, still calendar day N+1), not its start
        // (noon of day N) — using the start would just shift the same
        // bug by 12 hours instead of fixing it.
        func runOvernightVitalQuery(id: HKQuantityTypeIdentifier, field: String, extract: @escaping (HKStatistics) -> Double?) {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
            guard type.is(compatibleWith: HKUnit(from: "degC")) else { return }
            group.enter()
            var interval = DateComponents()
            interval.day = 1
            let midnightAnchor = calendar.startOfDay(for: startDate)
            let noonAnchor = calendar.date(byAdding: .hour, value: 12, to: midnightAnchor) ?? midnightAnchor
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: now, options: .strictStartDate)
            let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage, anchorDate: noonAnchor, intervalComponents: interval)
            q.initialResultsHandler = { _, collection, _ in
                defer { group.leave() }
                var pending: [(String, Double)] = []
                collection?.enumerateStatistics(from: startDate, to: now) { stats, _ in
                    guard let value = extract(stats) else { return }
                    pending.append((dateKey(stats.endDate), value))
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

        // Cumulative fields (steps, active/basal calories, exercise time) are
        // each independently tracked by BOTH the iPhone's motion coprocessor
        // AND the Apple Watch — a plain .cumulativeSum across all sources
        // adds them together instead of picking one, roughly doubling the
        // real value whenever the phone was carried while the watch was worn
        // (the normal case). Fix: use .separateBySource and take ONLY the
        // source whose name contains "Watch" — the Watch is the single
        // source of truth whenever it is present. If it is absent (Watch not
        // worn/charging), use HealthKit's aggregate for the remaining sources
        // so iPhone-only days do not disappear from the app.
        func runPreferredSourceSumQuery(id: HKQuantityTypeIdentifier, field: String, unit: HKUnit) {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
            guard type.is(compatibleWith: unit) else { return }
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
                    let watchSource = stats.sources?.first(where: { $0.name.localizedCaseInsensitiveContains("watch") })
                    let quantity = watchSource.flatMap { stats.sumQuantity(for: $0) } ?? stats.sumQuantity()
                    guard let value = quantity?.doubleValue(for: unit) else { return }
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
            runPreferredSourceSumQuery(id: id, field: field, unit: unit)
        }
        for (id, field, unit) in maxFields {
            runStatsQuery(id: id, field: field, unit: unit, option: .discreteMax) { $0.maximumQuantity()?.doubleValue(for: unit) }
        }

        // Wrist temperature (iOS 16+, Series 8+ only). Uses the UCUM unit
        // string "degC" rather than a named HKUnit convenience method, since
        // degreeCelsius() is not guaranteed present across SDK versions the
        // way degreeFahrenheit() historically is.
        //
        // Apple timestamps the nightly wrist-temperature reading near
        // BEDTIME, not wake-up time (unlike sleep-stage samples, which we
        // already attribute to the wake day). A plain midnight-to-midnight
        // day bucket therefore puts last night's reading under YESTERDAY's
        // date — so "today" always looks empty even though the value exists,
        // one day behind. Fix: bucket with a noon-to-noon day boundary
        // instead of midnight-to-midnight. Any time between noon on day N
        // and noon on day N+1 falls in a single bucket labeled day N+1 —
        // which always contains one full night regardless of what time the
        // user actually fell asleep, so the reading lands on the correct
        // wake-up day.
        if #available(iOS 16.0, *), HKObjectType.quantityType(forIdentifier: .appleSleepingWristTemperature) != nil {
            let celsius = HKUnit(from: "degC")
            runOvernightVitalQuery(id: .appleSleepingWristTemperature, field: "wristTemperature") { $0.averageQuantity()?.doubleValue(for: celsius) }
        }

        group.enter()
        let workoutPredicate = HKQuery.predicateForSamples(withStart: startDate, end: now, options: .strictStartDate)
        let workoutQuery = HKSampleQuery(
            sampleType: .workoutType(),
            predicate: workoutPredicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, _ in
            defer { group.leave() }
            guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount),
                  let workouts = samples as? [HKWorkout] else { return }
            let indoorCardio = workouts.filter { w in
                w.workoutActivityType == .elliptical
                    || (w.workoutActivityType == .cycling
                        && (w.metadata?[HKMetadataKeyIndoorWorkout] as? Bool ?? false))
            }
            for workout in indoorCardio {
                group.enter()
                let windowPredicate = HKQuery.predicateForSamples(
                    withStart: workout.startDate, end: workout.endDate, options: .strictStartDate
                )
                let stepsQuery = HKStatisticsQuery(
                    quantityType: stepType,
                    quantitySamplePredicate: windowPredicate,
                    options: [.cumulativeSum, .separateBySource]
                ) { _, stats, _ in
                    defer { group.leave() }
                    guard let stats else { return }
                    let watchSource = stats.sources?.first(where: { $0.name.localizedCaseInsensitiveContains("watch") })
                    let quantity = watchSource.flatMap { stats.sumQuantity(for: $0) } ?? stats.sumQuantity()
                    guard let value = quantity?.doubleValue(for: .count()), value > 0 else { return }
                    resultsQueue.sync {
                        stepsToSubtract[dateKey(workout.startDate), default: 0] += value
                    }
                }
                store.execute(stepsQuery)
            }
        }
        store.execute(workoutQuery)

        group.notify(queue: .main) {
            for (key, subtract) in stepsToSubtract {
                guard subtract > 0, let steps = results[key]?["steps"] as? Double else { continue }
                results[key]?["steps"] = max(0, steps - subtract)
            }
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
