import Foundation
import HealthKit
import Combine
import WatchConnectivity
import WatchKit

/// Lightweight `Error` wrapper for a plain human-readable message —
/// `Result`'s `Failure` type must conform to `Error`, which a bare `String`
/// doesn't. Supports both a literal (`.failure("some message")`) and
/// wrapping an existing `String` value (`.failure(SimpleError(msg))`).
struct SimpleError: Error, LocalizedError, ExpressibleByStringLiteral {
    let message: String
    init(_ message: String) { self.message = message }
    init(stringLiteral value: String) { self.message = value }
    var errorDescription: String? { message }
}

/**
 * Drives a live HKWorkoutSession on the Watch: starts/stops the session,
 * streams heart rate + active calories in real time via HKLiveWorkoutBuilder,
 * and saves the finished workout to HealthKit on end. The saved workout
 * lands in the same HealthKit store the phone's HealthKitPlugin.swift
 * already reads from — it shows up in Apple Fitness and in the app's Cardio
 * section on the next sync like any other Apple Watch workout.
 */
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    @Published var isRunning = false
    @Published var isPaused = false
    /// True between `start` and HealthKit confirming the session (or failing).
    @Published private(set) var isStarting = false
    @Published var elapsedSeconds: Int = 0
    @Published var heartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var stepCount: Int = 0
    /// Walking/running or cycling distance as the Watch measures it (treadmill included).
    @Published var distanceMeters: Double = 0
    @Published var authorizationGranted = false
    @Published var errorMessage: String?
    /// Human-readable dump of authorizationStatus(for:) per share type —
    /// HealthKit only ever reveals real grant/deny status for *share*
    /// (write) types, never read-only ones, so this is the most we can ever
    /// know in-app about why a session might be failing.
    @Published var shareAuthorizationDebug: String?

    /// Set in `start()`, cleared in `resetState()` — lets views decide
    /// whether to show zones, steps or the route without their own copy of
    /// the indoor/outdoor mapping.
    @Published private(set) var currentActivityType: HKWorkoutActivityType?
    @Published private(set) var activePlan: CardioSessionPlan?
    @Published var sessionAlert: CardioSessionAlert?

    enum CardioSessionAlert: Equatable { case enteredTargetZone, leftTargetZone, halftime, stepGoalReached }

    /// What a just-ended session amounted to — handed to the coordinator for
    /// the finish screen. `saved` is false for a discarded session.
    struct FinishedSession {
        let activityType: HKWorkoutActivityType
        let plan: CardioSessionPlan?
        let durationSeconds: Int
        let activeCalories: Double
        let averageHeartRate: Double?
        let distanceMeters: Double
        let saved: Bool
    }

    /// Called once per ended session (saved or discarded), on the main actor.
    var onSessionFinished: ((FinishedSession) -> Void)?

    var isCardioActivity: Bool {
        guard let type = currentActivityType else { return false }
        return type == .running || type == .cycling || type == .elliptical || type == .walking
    }

    /// Running/cycling/elliptical are paced by HR zones; walking is
    /// step-driven and shows no zone indicator or zone coaching.
    var usesHeartRateZones: Bool {
        guard let type = currentActivityType else { return false }
        return type == .running || type == .cycling || type == .elliptical
    }

    var usesGPS: Bool {
        guard let plan = activePlan else { return false }
        return !plan.isIndoor && (plan.activityType == .running || plan.activityType == .cycling || plan.activityType == .walking)
    }

    /// A session exists (starting, running, paused or ending).
    var hasSession: Bool { session != nil }

    /// Current HR zone (1-5), nil below Zone 1 or with no reading yet.
    var currentHeartRateZone: Int? {
        HeartRateZones.zone(forBpm: heartRate)
    }

    /// Most recent heart rate sample HealthKit has, independent of whether a
    /// workout is currently running. Used by HealthDashboardView when there's
    /// no live workout to stream from.
    @Published var latestHeartRate: Double?
    @Published var restingHeartRate: Double?
    @Published var heartRateVariability: Double?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var timer: Timer?
    private var startDate: Date?
    private var pauseStartDate: Date?
    private var totalPausedDuration: TimeInterval = 0
    /// Set by `cancel()` so the `.ended` delegate callback discards the
    /// workout instead of saving it — `session.end()` drives both "finish"
    /// and "cancel" through the same state transition.
    private var isCancelling = false
    /// stop()/cancel() was called for the current session. A `start()` that
    /// arrives meanwhile (finish strength → start cardio right away) must
    /// only queue behind it — it must NOT turn the pending save into a
    /// discard, which used to throw away the strength workout's heart rate
    /// and calories.
    @Published private(set) var isEnding = false
    /// Title of a start waiting for the previous session to finish saving
    /// (finish strength → tap cardio): the live screen shows it right away.
    @Published private(set) var queuedStartTitle: String?
    /// `.ended` arrived for the current session — the watchdog below only
    /// steps in when it never does, never while a save is in flight.
    private var endedReceived = false
    /// Identifies the current session for delayed callbacks (watchdog).
    private var sessionToken = UUID()

    /// A `start()` call that arrived while a previous session was still
    /// live — replayed from `resetState()` once that one has torn down.
    private var pendingStart: (plan: CardioSessionPlan, startedAt: Date?)?
    private var sessionAlertShownAt: Date?
    private var zoneMonitor: CardioZoneMonitor?
    private var halftimeFired = false
    private var autoStopFired = false
    private var stepGoalFired = false

    /// Fired once `beginCollection` actually confirms the session started
    /// (or failed to). A phone-initiated cardio-start request needs a
    /// definite yes/no to reply with.
    private var startCompletion: ((Result<Void, SimpleError>) -> Void)?

    private var heartRateType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .heartRate)! }
    private var bpm: HKUnit { HKUnit.count().unitDivided(by: .minute()) }

    private var readTypes: Set<HKObjectType> {
        [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.activitySummaryType(),
        ]
    }

    private var shareTypes: Set<HKSampleType> {
        [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
        ]
    }

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else {
            errorMessage = "HealthKit nicht verfügbar"
            return
        }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] success, error in
            Task { @MainActor in
                guard let self else { return }
                self.logShareAuthorizationStatus()
                if let error = error {
                    self.errorMessage = error.localizedDescription
                    return
                }
                self.authorizationGranted = success
            }
        }
    }

    /// Dumps authorizationStatus(for:) for every share type into
    /// shareAuthorizationDebug. Only share types report real status.
    private func logShareAuthorizationStatus() {
        let lines = shareTypes.map { type -> String in
            let name: String
            switch type {
            case HKObjectType.workoutType(): name = "Workout"
            case HKObjectType.quantityType(forIdentifier: .heartRate): name = "Herzfrequenz"
            case HKObjectType.quantityType(forIdentifier: .activeEnergyBurned): name = "Kalorien"
            case HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning): name = "Distanz Gehen/Laufen"
            case HKObjectType.quantityType(forIdentifier: .distanceCycling): name = "Distanz Rad"
            default: name = type.identifier
            }
            let status: String
            switch store.authorizationStatus(for: type) {
            case .notDetermined: status = "nicht entschieden"
            case .sharingDenied: status = "VERWEIGERT"
            case .sharingAuthorized: status = "erlaubt"
            @unknown default: status = "unbekannt"
            }
            return "\(name): \(status)"
        }
        shareAuthorizationDebug = lines.sorted().joined(separator: "\n")
    }

    /// Point-in-time snapshot for HealthDashboardView (not a live stream).
    func loadHealthSnapshot() {
        fetchLatestSample(.heartRate, unit: .count().unitDivided(by: .minute())) { [weak self] value in
            self?.latestHeartRate = value
        }
        fetchLatestSample(.restingHeartRate, unit: .count().unitDivided(by: .minute())) { [weak self] value in
            self?.restingHeartRate = value
        }
        fetchLatestSample(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli)) { [weak self] value in
            self?.heartRateVariability = value
        }
    }

    private func fetchLatestSample(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        completion: @escaping (Double?) -> Void
    ) {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            completion(nil)
            return
        }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            let value = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
            DispatchQueue.main.async { completion(value) }
        }
        store.execute(query)
    }

    // MARK: - Start

    /// `startedAt` overrides the session's base timestamp — used for
    /// phone-mirrored workouts so the Watch's elapsed-time display counts
    /// from the same server clock the phone's own timer uses.
    func start(
        plan: CardioSessionPlan,
        startedAt: Date? = nil,
        completion: ((Result<Void, SimpleError>) -> Void)? = nil
    ) {
        // The same activity is already live — typically the phone launched
        // this app with `startWatchApp` (the session began in
        // WKApplicationDelegate.handle) and its own "startCardio" message
        // with duration/zone arrives a moment later. Take the plan over
        // instead of tearing the session down and starting a second one.
        if session != nil, !isEnding, currentActivityType == plan.activityType, activePlan?.isIndoor == plan.isIndoor {
            adopt(plan)
            if isRunning {
                completion?(.success(()))
            } else if let completion {
                let earlier = startCompletion
                startCompletion = { result in
                    earlier?(result)
                    completion(result)
                }
            }
            return
        }

        replaceStartCompletion(with: completion)
        // HealthKit allows one active HKWorkoutSession at a time. A previous
        // one still tearing down (its own stop/cancel already requested)
        // just finishes first; the new start is replayed from resetState().
        guard session == nil else {
            pendingStart = (plan, startedAt)
            queuedStartTitle = plan.title
            if !isEnding {
                // A *different* live session is being replaced. Keep what it
                // recorded unless it was an accidental few seconds.
                isCancelling = elapsedSeconds < 60
                isEnding = true
                stopTimer()
                endSessionOrForceReset()
            }
            return
        }
        beginSession(plan: plan, startedAt: startedAt)
    }

    func start(
        activityType: HKWorkoutActivityType,
        startedAt: Date? = nil,
        completion: ((Result<Void, SimpleError>) -> Void)? = nil
    ) {
        let plan = CardioSessionPlan(
            activityType: activityType,
            isIndoor: activityType == .traditionalStrengthTraining || activityType == .elliptical,
            durationMinutes: nil,
            targetZone: nil,
            stepGoal: nil
        )
        start(plan: plan, startedAt: startedAt, completion: completion)
    }

    /// Duration / zone / step goal arrived late for the running session
    /// (phone's queued "applyCardioPlan"). Ignored for anything else.
    func applyPlanIfRunning(_ plan: CardioSessionPlan) {
        guard session != nil, !isEnding, currentActivityType == plan.activityType else { return }
        adopt(plan)
    }

    private func adopt(_ plan: CardioSessionPlan) {
        activePlan = plan
        zoneMonitor = plan.targetZone.map { CardioZoneMonitor(targetZone: $0) }
        halftimeFired = false
        autoStopFired = false
        stepGoalFired = false
    }

    /// Only one caller can wait for a start; an older one learns it was superseded.
    private func replaceStartCompletion(with completion: ((Result<Void, SimpleError>) -> Void)?) {
        let previous = startCompletion
        startCompletion = completion
        previous?(.failure("Durch einen neuen Start ersetzt"))
    }

    private func beginSession(plan: CardioSessionPlan, startedAt: Date?) {
        currentActivityType = plan.activityType
        activePlan = plan
        zoneMonitor = plan.targetZone.map { CardioZoneMonitor(targetZone: $0) }
        errorMessage = nil
        sessionToken = UUID()
        let token = sessionToken
        isEnding = false
        endedReceived = false
        let config = HKWorkoutConfiguration()
        config.activityType = plan.activityType
        config.locationType = plan.isIndoor ? .indoor : .outdoor

        do {
            let newSession = try HKWorkoutSession(healthStore: store, configuration: config)
            let newBuilder = newSession.associatedWorkoutBuilder()
            let dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            if let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) {
                dataSource.enableCollection(for: stepType, predicate: nil)
            }
            newBuilder.dataSource = dataSource
            newSession.delegate = self
            newBuilder.delegate = self
            session = newSession
            builder = newBuilder
            isStarting = true

            let start = startedAt ?? Date()
            startDate = start
            newSession.startActivity(with: start)
            newBuilder.beginCollection(withStart: start) { [weak self] success, error in
                Task { @MainActor in
                    // The session may have been stopped/replaced meanwhile —
                    // then this answer belongs to nobody anymore.
                    guard let self, self.sessionToken == token else { return }
                    self.isStarting = false
                    let completion = self.startCompletion
                    self.startCompletion = nil
                    if let error = error {
                        // Clean up the already-started session — otherwise it
                        // lingers as a zombie that blocks the next start().
                        self.errorMessage = error.localizedDescription
                        self.logShareAuthorizationStatus()
                        self.session?.end()
                        self.builder?.discardWorkout()
                        self.resetState()
                        completion?(.failure(SimpleError(error.localizedDescription)))
                        return
                    }
                    self.isRunning = true
                    self.startTimer()
                    completion?(.success(()))
                }
            }
        } catch {
            isStarting = false
            errorMessage = error.localizedDescription
            currentActivityType = nil
            activePlan = nil
            zoneMonitor = nil
            let completion = startCompletion
            startCompletion = nil
            completion?(.failure(SimpleError(error.localizedDescription)))
        }
    }

    // MARK: - Recovery after a crash

    /// watchOS relaunches the app after a crash during a workout
    /// (WKApplicationDelegate.handleActiveWorkoutRecovery) — reattach to the
    /// still-running session instead of losing it.
    func recoverActiveSession() {
        store.recoverActiveWorkoutSession { [weak self] recovered, _ in
            guard let recovered else { return }
            Task { @MainActor in
                self?.attach(recovered: recovered)
            }
        }
    }

    private func attach(recovered: HKWorkoutSession) {
        guard session == nil else { return }
        let config = recovered.workoutConfiguration
        let recoveredBuilder = recovered.associatedWorkoutBuilder()
        recoveredBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
        recovered.delegate = self
        recoveredBuilder.delegate = self
        session = recovered
        builder = recoveredBuilder
        sessionToken = UUID()
        isEnding = false
        endedReceived = false
        currentActivityType = config.activityType
        activePlan = CardioSessionPlan(
            activityType: config.activityType,
            isIndoor: config.locationType == .indoor,
            durationMinutes: nil,
            targetZone: nil,
            stepGoal: nil
        )
        let start = recovered.startDate ?? recoveredBuilder.startDate ?? Date()
        startDate = start
        // Active time from the builder; everything else since the start was paused.
        totalPausedDuration = max(0, Date().timeIntervalSince(start) - recoveredBuilder.elapsedTime)
        isRunning = true
        isPaused = recovered.state == .paused
        if isPaused {
            pauseStartDate = Date()
        } else {
            startTimer()
        }
    }

    // MARK: - Stop / pause

    /// Ends the workout and saves it to HealthKit.
    func stop() {
        isEnding = true
        stopTimer()
        endSessionOrForceReset()
    }

    /// Ends the workout and discards it — nothing gets saved to HealthKit.
    func cancel() {
        isCancelling = true
        isEnding = true
        stopTimer()
        endSessionOrForceReset()
    }

    /// `session.end()` only works from the running/paused states. If the
    /// session died into HealthKit's error state (common in the simulator,
    /// which has no live heart-rate source), `.ended` never fires — a
    /// watchdog resets after 3 s, but ONLY if `.ended` never arrived for
    /// this very session (it used to fire while a slow save was still
    /// running and discard a perfectly good workout).
    private func endSessionOrForceReset() {
        guard let session, session.state == .running || session.state == .paused else {
            builder?.discardWorkout()
            resetState()
            return
        }
        let token = sessionToken
        session.end()

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.sessionToken == token, !self.endedReceived, self.session != nil else { return }
            self.builder?.discardWorkout()
            self.resetState()
        }
    }

    func pause() {
        session?.pause()
    }

    func resume() {
        session?.resume()
    }

    /// Average heart rate of the current session so far.
    private var averageHeartRate: Double? {
        builder?.statistics(for: heartRateType)?.averageQuantity()?.doubleValue(for: bpm)
    }

    /// Time, calories and average heart rate of the running session — taken
    /// by the coordinator right before it stops a strength session.
    func snapshot() -> (durationSeconds: Int, activeCalories: Double, averageHeartRate: Double?) {
        (elapsedSeconds, activeCalories, averageHeartRate)
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let start = self.startDate else { return }
                self.elapsedSeconds = max(0, Int(Date().timeIntervalSince(start) - self.totalPausedDuration))
                self.handleTick()
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    /// Back to idle. A start someone is still waiting for (the phone's
    /// "startCardio" reply) and that no queued start takes over is answered
    /// with a failure here — nothing else would ever answer it.
    private func resetState() {
        stopTimer()
        isRunning = false
        isPaused = false
        isStarting = false
        elapsedSeconds = 0
        heartRate = 0
        activeCalories = 0
        stepCount = 0
        distanceMeters = 0
        startDate = nil
        pauseStartDate = nil
        totalPausedDuration = 0
        isCancelling = false
        isEnding = false
        endedReceived = false
        sessionToken = UUID()
        session = nil
        builder = nil
        currentActivityType = nil
        activePlan = nil
        zoneMonitor = nil
        halftimeFired = false
        autoStopFired = false
        stepGoalFired = false
        sessionAlert = nil
        sessionAlertShownAt = nil

        // Replays a start that arrived while the previous session was still
        // tearing down, now that it actually has.
        queuedStartTitle = nil
        if let pending = pendingStart {
            pendingStart = nil
            beginSession(plan: pending.plan, startedAt: pending.startedAt)
        } else {
            // A failed/aborted start nobody else will answer.
            let completion = startCompletion
            startCompletion = nil
            completion?(.failure(SimpleError(errorMessage ?? "Training konnte nicht gestartet werden")))
        }
    }

    private func showAlert(_ alert: CardioSessionAlert) {
        sessionAlert = alert
        sessionAlertShownAt = Date()
    }

    private func handleTick() {
        if let shownAt = sessionAlertShownAt, Date().timeIntervalSince(shownAt) > 4 {
            sessionAlert = nil
            sessionAlertShownAt = nil
        }
        if let event = zoneMonitor?.evaluate(currentZone: currentHeartRateZone) {
            switch event {
            case .enteredZone:
                WKInterfaceDevice.current().play(.success)
                showAlert(.enteredTargetZone)
            case .leftZone:
                WKInterfaceDevice.current().play(.directionDown)
                showAlert(.leftTargetZone)
            }
        }
        if let goal = activePlan?.stepGoal, !stepGoalFired, stepCount >= goal {
            stepGoalFired = true
            WKInterfaceDevice.current().play(.success)
            WatchCardioNotifications.notifyStepGoalReached(goal: goal)
            showAlert(.stepGoalReached)
            // Bewusst KEIN stop() — Ziel erreicht heißt nur benachrichtigen,
            // der Spaziergang läuft weiter bis zum manuellen Beenden.
        }
        guard let minutes = activePlan?.durationMinutes else { return }
        let total = minutes * 60
        if !autoStopFired, elapsedSeconds >= total {
            autoStopFired = true
            halftimeFired = true
            WKInterfaceDevice.current().play(.stop)
            WatchCardioNotifications.notifyCardioComplete()
            stop()
            return
        }
        if !halftimeFired, elapsedSeconds >= total / 2 {
            halftimeFired = true
            WKInterfaceDevice.current().play(.notification)
            showAlert(.halftime)
        }
    }

    // MARK: - Session end (called from the delegate, on the main actor)

    private func sessionDidEnd(at date: Date) {
        endedReceived = true
        stopTimer()
        let summary = FinishedSession(
            activityType: currentActivityType ?? .other,
            plan: activePlan,
            durationSeconds: elapsedSeconds,
            activeCalories: activeCalories,
            averageHeartRate: averageHeartRate,
            distanceMeters: distanceMeters,
            saved: !isCancelling
        )
        guard let builder else {
            resetState()
            return
        }
        let discard = isCancelling
        builder.endCollection(withEnd: date) { [weak self] _, _ in
            Task { @MainActor in
                guard let self else { return }
                if discard {
                    builder.discardWorkout()
                    self.resetState()
                    self.onSessionFinished?(summary)
                    return
                }
                builder.finishWorkout { workout, error in
                    Task { @MainActor in
                        if let error = error { self.errorMessage = error.localizedDescription }
                        if workout != nil {
                            // Tell the phone a new session just landed in
                            // HealthKit so it syncs it to the server right
                            // away (transferUserInfo: queued, delivered even
                            // if the phone isn't reachable right now).
                            if WCSession.isSupported(), WCSession.default.activationState == .activated {
                                WCSession.default.transferUserInfo(["type": "cardioSaved"])
                            }
                        }
                        self.resetState()
                        self.onSessionFinished?(FinishedSession(
                            activityType: summary.activityType,
                            plan: summary.plan,
                            durationSeconds: summary.durationSeconds,
                            activeCalories: summary.activeCalories,
                            averageHeartRate: summary.averageHeartRate,
                            distanceMeters: summary.distanceMeters,
                            saved: workout != nil
                        ))
                    }
                }
            }
        }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            // Late callbacks from an already replaced session are ignored.
            guard workoutSession === self.session else { return }
            switch toState {
            case .paused:
                self.isPaused = true
                self.pauseStartDate = date
                self.stopTimer()

            case .running:
                guard fromState == .paused, let pauseStart = self.pauseStartDate else { return }
                self.totalPausedDuration += date.timeIntervalSince(pauseStart)
                self.pauseStartDate = nil
                self.isPaused = false
                self.startTimer()

            case .ended:
                self.sessionDidEnd(at: date)

            default:
                break
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            guard workoutSession === self.session else { return }
            // The session is unrecoverable once it reports a failure, so tear
            // everything down — otherwise isRunning stays true forever.
            self.errorMessage = error.localizedDescription
            self.logShareAuthorizationStatus()
            self.builder?.discardWorkout()
            self.resetState()
        }
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in
            guard workoutBuilder === self.builder else { return }
            for type in collectedTypes {
                guard let quantityType = type as? HKQuantityType,
                      let statistics = workoutBuilder.statistics(for: quantityType) else { continue }

                if quantityType == HKObjectType.quantityType(forIdentifier: .heartRate) {
                    self.heartRate = statistics.mostRecentQuantity()?.doubleValue(for: self.bpm) ?? self.heartRate
                } else if quantityType == HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
                    self.activeCalories = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? self.activeCalories
                } else if quantityType == HKObjectType.quantityType(forIdentifier: .stepCount) {
                    self.stepCount = Int(statistics.sumQuantity()?.doubleValue(for: .count()) ?? Double(self.stepCount))
                } else if quantityType == HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
                            || quantityType == HKObjectType.quantityType(forIdentifier: .distanceCycling) {
                    self.distanceMeters = statistics.sumQuantity()?.doubleValue(for: .meter()) ?? self.distanceMeters
                }
            }
        }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // No-op — we don't currently react to lap/pause events.
    }
}
