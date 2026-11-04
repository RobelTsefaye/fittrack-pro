//
//  WatchCoordinator.swift
//  FitTrackWatch Watch App
//
//  Everything that has to happen whether or not a screen is visible: the
//  phone starting or stopping a session, the strength workout ending on
//  either device, live heart rate going to the phone every second, the GPS
//  route following the session. This used to be wired up in
//  ContentView.onAppear / .onChange — which only run while that view is
//  rendered. A Watch launched in the background by the phone
//  (`startWatchApp`) or with the screen off never got there.
//
//  Also owns the finish screen: a summary after every saved session and, for
//  a plan day flagged "Cardio danach", the treadmill / indoor bike /
//  elliptical offer.
//

import Foundation
import HealthKit
import Combine
import WatchKit

/// What the finish screen shows.
struct FinishSummary: Identifiable {
    enum Kind { case strength, cardio }

    let id = UUID()
    let kind: Kind
    let title: String
    let durationSeconds: Int?
    let activeCalories: Double?
    let averageHeartRate: Double?
    let distanceMeters: Double?
    let completedSets: Int?
    let volume: Double?
    /// Strength day flagged "Cardio danach".
    let offersCardio: Bool
    let createdAt = Date()
}

final class WatchCoordinator: ObservableObject {
    static let shared = WatchCoordinator()

    let workoutManager: WorkoutManager
    let phoneObserver: PhoneWorkoutObserver
    let routeTracker: RouteLocationTracker

    /// Result screen after a finished session. Cleared by "Fertig", by the
    /// next session starting, or after 30 minutes.
    @Published var finish: FinishSummary?

    private var activated = false
    private var cancellables = Set<AnyCancellable>()
    /// Remembers that live samples went to the phone for the current
    /// session, so a final "stopped" sample follows when it ends.
    private var cardioPushActive = false
    /// Last workout id the strength auto-start reacted to.
    private var lastActiveWorkoutId: String?
    /// Bumped to invalidate a pending wake-up check (see guardWakeWithoutWorkout).
    private var wakeGuardToken = 0

    private init() {
        workoutManager = WorkoutManager()
        phoneObserver = PhoneWorkoutObserver.shared
        routeTracker = RouteLocationTracker()
    }

    /// Wires everything once. Called at launch (app init + delegate) and
    /// before handling a workout configuration from the phone.
    func activate() {
        guard !activated else { return }
        activated = true
        workoutManager.requestAuthorization()

        phoneObserver.onActiveWorkoutCleared = { [weak self] wasCancelled, workout in
            self?.strengthWorkoutEnded(workout, cancelled: wasCancelled)
        }
        phoneObserver.onCardioStartRequested = { [weak self] plan in
            guard let self else { return .failure("Watch-App nicht bereit") }
            return await self.startFromPhone(plan)
        }
        phoneObserver.onCardioStopRequested = { [weak self] discard in
            guard let self, self.workoutManager.isCardioActivity else { return }
            if discard {
                self.workoutManager.cancel()
            } else {
                self.workoutManager.stop()
            }
        }
        phoneObserver.onCardioPlanReceived = { [weak self] plan in
            self?.workoutManager.applyPlanIfRunning(plan)
        }
        workoutManager.onSessionFinished = { [weak self] finished in
            self?.sessionFinished(finished)
        }

        // A phone workout appeared → heart rate and calories run for the
        // whole strength session, no button needed. `$activeWorkout` emits
        // the new value before it is stored, hence the id bookkeeping.
        phoneObserver.$activeWorkout
            .sink { [weak self] workout in
                guard let self else { return }
                let id = workout?.workoutId
                defer { self.lastActiveWorkoutId = id }
                guard let workout, id != self.lastActiveWorkoutId else { return }
                self.finish = nil
                self.wakeGuardToken += 1
                self.startStrengthIfIdle(startedAt: workout.startedAtDate)
            }
            .store(in: &cancellables)

        // Authorization can land after the phone workout did.
        workoutManager.$authorizationGranted
            .removeDuplicates()
            .sink { [weak self] granted in
                guard let self, granted, let workout = self.phoneObserver.activeWorkout else { return }
                DispatchQueue.main.async {
                    self.startStrengthIfIdle(startedAt: workout.startedAtDate)
                }
            }
            .store(in: &cancellables)

        // Live HR/calories/zone to the phone every second of any cardio
        // session — Watch- or phone-started — so the phone's live view and
        // banner stay as current as the Watch's own display.
        workoutManager.$elapsedSeconds
            .sink { [weak self] seconds in
                self?.pushCardioLive(elapsed: seconds)
            }
            .store(in: &cancellables)

        workoutManager.$isRunning
            .removeDuplicates()
            .sink { [weak self] running in
                self?.runningChanged(running)
            }
            .store(in: &cancellables)

        // GPS route pauses in step with the session.
        workoutManager.$isPaused
            .removeDuplicates()
            .sink { [weak self] paused in
                guard let self, self.workoutManager.usesGPS else { return }
                if paused {
                    self.routeTracker.pause()
                } else {
                    self.routeTracker.resume()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Launch from the phone

    /// `HKHealthStore.startWatchApp(with:)` on the phone lands here
    /// (WKApplicationDelegate.handle). The session must start right away —
    /// the phone's own "startCardio" message with duration and target zone
    /// follows once the app is reachable and is taken over by the running
    /// session (WorkoutManager.start adopts the same activity).
    func handleLaunch(with configuration: HKWorkoutConfiguration) {
        activate()
        guard !workoutManager.hasSession else { return }
        if configuration.activityType == .traditionalStrengthTraining {
            startStrengthIfIdle(startedAt: phoneObserver.activeWorkout?.startedAtDate)
            guardWakeWithoutWorkout()
        } else {
            finish = nil
            workoutManager.start(plan: CardioSessionPlan(
                activityType: configuration.activityType,
                isIndoor: configuration.locationType == .indoor,
                durationMinutes: nil,
                targetZone: nil,
                stepGoal: nil
            ))
        }
    }

    /// The phone woke the Watch for a strength workout that then never
    /// arrived (start failed, phone went away) — don't let a heart-rate
    /// session run on for hours.
    private func guardWakeWithoutWorkout() {
        wakeGuardToken += 1
        let token = wakeGuardToken
        DispatchQueue.main.asyncAfter(deadline: .now() + 120) { [weak self] in
            guard let self,
                  self.wakeGuardToken == token,
                  self.phoneObserver.activeWorkout == nil,
                  self.workoutManager.currentActivityType == .traditionalStrengthTraining else { return }
            self.workoutManager.cancel()
        }
    }

    private func startFromPhone(_ plan: CardioSessionPlan) async -> Result<Void, SimpleError> {
        finish = nil
        return await withCheckedContinuation { continuation in
            workoutManager.start(plan: plan) { result in
                continuation.resume(returning: result)
            }
        }
    }

    // MARK: - Starting on the Watch

    func startCardio(_ kind: CardioKind, minutes: Int? = nil, zone: Int? = nil, stepGoal: Int? = nil) {
        finish = nil
        workoutManager.start(plan: kind.plan(minutes: minutes, zone: zone, stepGoal: stepGoal))
    }

    private func startStrengthIfIdle(startedAt: Date?) {
        guard !workoutManager.hasSession else { return }
        workoutManager.start(activityType: .traditionalStrengthTraining, startedAt: startedAt)
    }

    // MARK: - Ends

    /// The phone workout is gone — finished or cancelled on the phone or
    /// here. Only the strength heart-rate session belongs to it; a cardio
    /// session started meanwhile keeps running.
    private func strengthWorkoutEnded(_ workout: WatchActiveWorkout, cancelled: Bool) {
        WatchRestTimerNotifications.cancel()
        wakeGuardToken += 1
        let ownsSession = workoutManager.currentActivityType == .traditionalStrengthTraining
        if cancelled {
            if ownsSession { workoutManager.cancel() }
            return
        }
        let stats = ownsSession ? workoutManager.snapshot() : nil
        if ownsSession { workoutManager.stop() }
        let offersCardio = workout.cardioAfter ?? phoneObserver.planSession(id: workout.planSessionId)?.cardioAfter ?? false
        show(FinishSummary(
            kind: .strength,
            title: workout.name ?? "Training",
            durationSeconds: stats?.durationSeconds ?? workout.startedAtDate.map { Int(Date().timeIntervalSince($0)) },
            activeCalories: stats?.activeCalories,
            averageHeartRate: stats?.averageHeartRate,
            distanceMeters: nil,
            completedSets: workout.completedSetCount,
            volume: workout.volume,
            offersCardio: offersCardio
        ))
        WKInterfaceDevice.current().play(.success)
    }

    private func sessionFinished(_ finished: WorkoutManager.FinishedSession) {
        // Strength has its own summary (above); a session replaced by a new
        // one has nothing to show while the new one runs.
        guard finished.saved,
              finished.activityType != .traditionalStrengthTraining,
              !workoutManager.hasSession else { return }
        show(FinishSummary(
            kind: .cardio,
            title: finished.plan?.title ?? "Cardio",
            durationSeconds: finished.durationSeconds,
            activeCalories: finished.activeCalories,
            averageHeartRate: finished.averageHeartRate,
            distanceMeters: finished.distanceMeters > 0 ? finished.distanceMeters : nil,
            completedSets: nil,
            volume: nil,
            offersCardio: false
        ))
    }

    private func show(_ summary: FinishSummary) {
        finish = summary
        let id = summary.id
        DispatchQueue.main.asyncAfter(deadline: .now() + 30 * 60) { [weak self] in
            if self?.finish?.id == id { self?.finish = nil }
        }
    }

    func dismissFinish() {
        finish = nil
    }

    // MARK: - Live data to the phone + route

    private func pushCardioLive(elapsed seconds: Int) {
        guard workoutManager.isRunning, workoutManager.isCardioActivity else { return }
        cardioPushActive = true
        phoneObserver.pushCardioLiveUpdate(
            isRunning: true,
            heartRate: workoutManager.heartRate,
            activeCalories: workoutManager.activeCalories,
            elapsedSeconds: seconds,
            zone: workoutManager.currentHeartRateZone,
            targetZone: workoutManager.activePlan?.targetZone,
            durationSeconds: workoutManager.activePlan?.durationMinutes.map { $0 * 60 },
            stepCount: workoutManager.currentActivityType == .walking ? workoutManager.stepCount : nil,
            stepGoal: workoutManager.activePlan?.stepGoal
        )
    }

    /// `$isRunning` emits before the value is stored — everything else on
    /// the manager (activity type, plan) is already current at that point.
    private func runningChanged(_ running: Bool) {
        if running {
            if workoutManager.isCardioActivity {
                finish = nil
                pushCardioLive(elapsed: workoutManager.elapsedSeconds)
            }
            if workoutManager.usesGPS { routeTracker.start() }
        } else {
            routeTracker.stop()
            if cardioPushActive {
                cardioPushActive = false
                phoneObserver.pushCardioLiveUpdate(
                    isRunning: false, heartRate: 0, activeCalories: 0, elapsedSeconds: 0, zone: nil,
                    targetZone: nil, durationSeconds: nil, stepCount: nil, stepGoal: nil
                )
            }
        }
    }
}
