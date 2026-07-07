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
                    if let error = error {
                        self?.errorMessage = error.localizedDescription
                        return
                    }
                    self?.isRunning = true
                    self?.startTimer()
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        session?.end()
        stopTimer()
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let start = self?.startDate else { return }
                self?.elapsedSeconds = Int(Date().timeIntervalSince(start))
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func resetState() {
        isRunning = false
        elapsedSeconds = 0
        heartRate = 0
        activeCalories = 0
        startDate = nil
        session = nil
        builder = nil
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in
            self.builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
                self?.builder?.finishWorkout { _, error in
                    Task { @MainActor in
                        if let error = error { self?.errorMessage = error.localizedDescription }
                        self?.resetState()
                    }
                }
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            self.errorMessage = error.localizedDescription
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
