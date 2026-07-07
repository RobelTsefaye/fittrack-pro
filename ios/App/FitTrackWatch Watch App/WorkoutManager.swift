import Foundation
import HealthKit
import Combine

/**
 * Drives a live HKWorkoutSession on the Watch: starts/stops the session,
 * streams heart rate + active calories in real time via HKLiveWorkoutBuilder,
 * and saves the finished workout to HealthKit on end. The saved workout
 * lands in the same HealthKit store the phone's HealthKitPlugin.swift
 * already reads from — no extra sync code needed, it just shows up in the
 * app's Cardio section on the next sync like any other Apple Watch workout.
 */
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    @Published var isRunning = false
    @Published var isPaused = false
    @Published var elapsedSeconds: Int = 0
    @Published var heartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var authorizationGranted = false
    @Published var errorMessage: String?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var timer: Timer?
    private var startDate: Date?
    private var pauseStartDate: Date?
    private var totalPausedDuration: TimeInterval = 0
    /// Set by `cancel()` so the `.ended` delegate callback discards the
    /// workout instead of saving it — `session.end()` drives both "finish"
    /// and "cancel" through the same state transition, so this flag is the
    /// only way to tell them apart once the delegate fires.
    private var isCancelling = false

    private var readTypes: Set<HKObjectType> {
        [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.activitySummaryType(),
        ]
    }

    private var shareTypes: Set<HKSampleType> {
        [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        ]
    }

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else {
            errorMessage = "HealthKit nicht verfügbar"
            return
        }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] success, error in
            Task { @MainActor in
                if let error = error {
                    self?.errorMessage = error.localizedDescription
                    return
                }
                self?.authorizationGranted = success
            }
        }
    }

    func start(activityType: HKWorkoutActivityType) {
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = activityType == .traditionalStrengthTraining
            || activityType == .highIntensityIntervalTraining
            ? .indoor
            : .outdoor

        do {
            session = try HKWorkoutSession(healthStore: store, configuration: config)
            builder = session?.associatedWorkoutBuilder()
            builder?.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session?.delegate = self
            builder?.delegate = self

            let start = Date()
            startDate = start
            session?.startActivity(with: start)
            builder?.beginCollection(withStart: start) { [weak self] success, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error = error {
                        // Clean up the already-started session — otherwise it
                        // lingers as a zombie that blocks the next start().
                        self.errorMessage = error.localizedDescription
                        self.session?.end()
                        self.resetState()
                        return
                    }
                    self.isRunning = true
                    self.startTimer()
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Ends the workout and saves it to HealthKit.
    func stop() {
        stopTimer()
        endSessionOrForceReset()
    }

    /// Ends the workout and discards it — nothing gets saved to HealthKit.
    func cancel() {
        isCancelling = true
        stopTimer()
        endSessionOrForceReset()
    }

    /// `session.end()` only works from the running/paused states. If the
    /// session died into HealthKit's error state (common in the simulator,
    /// which has no live heart-rate source), no transition is allowed and
    /// `.ended` never fires — which used to leave `isRunning` stuck true and
    /// the UI unable to ever leave the workout screens. Force-reset instead.
    private func endSessionOrForceReset() {
        guard let session, session.state == .running || session.state == .paused else {
            builder?.discardWorkout()
            resetState()
            return
        }
        session.end()
    }

    func pause() {
        session?.pause()
    }

    func resume() {
        session?.resume()
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let start = self.startDate else { return }
                self.elapsedSeconds = Int(Date().timeIntervalSince(start) - self.totalPausedDuration)
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func resetState() {
        isRunning = false
        isPaused = false
        elapsedSeconds = 0
        heartRate = 0
        activeCalories = 0
        startDate = nil
        pauseStartDate = nil
        totalPausedDuration = 0
        isCancelling = false
        session = nil
        builder = nil
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
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
                self.builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
                    guard let self else { return }
                    if self.isCancelling {
                        self.builder?.discardWorkout()
                        Task { @MainActor in self.resetState() }
                    } else {
                        self.builder?.finishWorkout { _, error in
                            Task { @MainActor in
                                if let error = error { self.errorMessage = error.localizedDescription }
                                self.resetState()
                            }
                        }
                    }
                }

            default:
                break
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            // The session is unrecoverable once it reports a failure (it sits
            // in an error state that allows no further transitions), so tear
            // everything down — otherwise isRunning stays true forever and
            // the UI can never leave the workout screens.
            self.errorMessage = error.localizedDescription
            self.stopTimer()
            self.builder?.discardWorkout()
            self.resetState()
        }
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in
            for type in collectedTypes {
                guard let quantityType = type as? HKQuantityType,
                      let statistics = workoutBuilder.statistics(for: quantityType) else { continue }

                if quantityType == HKObjectType.quantityType(forIdentifier: .heartRate) {
                    let unit = HKUnit.count().unitDivided(by: .minute())
                    self.heartRate = statistics.mostRecentQuantity()?.doubleValue(for: unit) ?? self.heartRate
                } else if quantityType == HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
                    self.activeCalories = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? self.activeCalories
                }
            }
        }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // No-op — we don't currently react to lap/pause events.
    }
}
