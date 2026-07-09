import Foundation
import WatchConnectivity
import Combine

/**
 * Receives workout-state pushes from the paired iPhone (see
 * WatchConnectivityPlugin.swift on the phone side) via
 * `updateApplicationContext`. ContentView shows this alongside the Watch's
 * own standalone workout option — if a phone workout is active, the Watch
 * can just mirror it instead of starting a separate session.
 */
final class PhoneWorkoutObserver: NSObject, ObservableObject {
    /// The full workout currently running on the paired iPhone, kept in sync
    /// via `updateApplicationContext` (see WatchConnectivityPlugin.swift on
    /// the phone side). Non-nil for the whole lifetime of a phone-started
    /// workout — ContentView routes straight into KraftLoggingView while
    /// this is set, instead of a separate summary/mirror screen.
    @Published var activeWorkout: WatchActiveWorkout? {
        didSet {
            guard oldValue?.workoutId != activeWorkout?.workoutId else { return }
            guard oldValue != nil, activeWorkout == nil else { return }
            let wasCancelled = pendingCancellation
            pendingCancellation = false
            onActiveWorkoutCleared?(wasCancelled)
        }
    }

    /// Set right before `cancelWorkout` fires, so the `didSet` above knows
    /// the next "workout went away" should discard the Watch's own HR
    /// session (`WorkoutManager.cancel()`) instead of saving it (`.stop()`)
    /// — both a finish and a cancel look identical from here otherwise.
    var pendingCancellation = false

    /// Ends/discards the Watch's own HR session whenever `activeWorkout`
    /// transitions to nil, for whatever reason (phone finished/cancelled it,
    /// or a local finish/cancel on the Watch itself). Deliberately fired
    /// from here — a `didSet` on the published property — rather than a
    /// SwiftUI `.onChange` in ContentView: `didReceiveApplicationContext`
    /// can update `activeWorkout` while the Watch app is backgrounded or not
    /// currently rendering ContentView at all, and a view-level `.onChange`
    /// only reacts once some view happens to be actively observing this
    /// property again — until then, a workout cancelled from the phone left
    /// the HKWorkoutSession (and its HR measurement) running indefinitely.
    var onActiveWorkoutCleared: ((_ wasCancelled: Bool) -> Void)?

    /// True while the *current* WorkoutManager session was started by a
    /// phone "Cardio starten" request, as opposed to a Watch-only manual
    /// start from StartView — gates the periodic live-stats push in
    /// ContentView, so an ordinary Watch-initiated Laufen/Radfahren session
    /// doesn't also start streaming to a phone screen nothing navigated the
    /// user to.
    @Published var isPhoneInitiatedCardio = false

    /// Set once in ContentView.onAppear — a phone-initiated cardio-start
    /// request needs to drive the shared WorkoutManager, which ContentView
    /// (not this observer) owns. Returns the HealthKit-confirmed outcome so
    /// the reply sent back to the phone reflects reality, not just "request
    /// received." `@MainActor`-typed since the implementation calls into
    /// WorkoutManager (itself @MainActor) — the `Task { @MainActor in ... }`
    /// call site below hops there before invoking it.
    var onCardioStartRequested: (@MainActor (_ activityType: String) async -> Result<Void, String>)?

    /// Set once in ContentView.onAppear — ends/discards the shared
    /// WorkoutManager session in response to a phone-initiated stop request.
    var onCardioStopRequested: (@MainActor (_ discard: Bool) -> Void)?

    /// Strength-training plan catalog pushed from the phone, backing the
    /// standalone Kraft session picker. Empty until the phone app has synced
    /// at least once (see watch-workout-sync.ts on the phone side).
    @Published var planSessions: [WatchPlanSession] = []

    /// Recovery Score pushed from the phone (health-dashboard.tsx), backing
    /// HealthDashboardView. Nil until the phone has computed at least one —
    /// this is a separate device from the phone's own widget/complication,
    /// which read a local App Group snapshot the Watch has no access to.
    @Published var recoveryScore: Int?
    @Published var recoveryLevel: String?

    /// Workouts the user already finished/cancelled *on the Watch*. A stale
    /// application-context push (the phone's clear can lag its ack by
    /// seconds, or never arrive if its background fetch fails) still carries
    /// the old workout — without this guard it would resurrect the workout
    /// the user just left. `apply` drops pushes for these ids.
    private var locallyEndedWorkoutIds: Set<String> = []

    /// Local exit path for finish/cancel on the Watch: leaves the workout
    /// immediately (driving the `didSet` above, which stops or discards the
    /// HR session based on `pendingCancellation`) and remembers the id so a
    /// stale re-push can't bring it back.
    func endWorkoutLocally(_ workoutId: String) {
        DispatchQueue.main.async {
            self.locallyEndedWorkoutIds.insert(workoutId)
            if self.activeWorkout?.workoutId == workoutId {
                self.activeWorkout = nil
            }
        }
    }

    // Request/reply methods (startSession/logSet/finishWorkout) live here
    // rather than in a second WCSessionDelegate class, since only one object
    // may hold that role on the Watch — see the class doc comment above.

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func apply(_ context: [String: Any]) {
        DispatchQueue.main.async {
            let active = context["active"] as? Bool ?? false
            if active, let workoutJSON = context["activeWorkout"] as? String {
                if let data = workoutJSON.data(using: .utf8) {
                    do {
                        let workout = try JSONDecoder().decode(WatchActiveWorkout.self, from: data)
                        // Drop stale pushes for workouts already ended on the
                        // Watch (see locallyEndedWorkoutIds above).
                        self.activeWorkout = self.locallyEndedWorkoutIds.contains(workout.workoutId) ? nil : workout
                    } catch {
                        // A decode failure here otherwise looks identical to
                        // "no workout active" — log it so a schema mismatch
                        // is visible in the Watch console instead of silently
                        // stranding the user on the session picker.
                        print("PhoneWorkoutObserver: failed to decode activeWorkout: \(error)")
                        self.activeWorkout = nil
                    }
                } else {
                    self.activeWorkout = nil
                }
            } else {
                self.activeWorkout = nil
            }

            if let catalogJSON = context["planCatalog"] as? String,
               let data = catalogJSON.data(using: .utf8),
               let catalog = try? JSONDecoder().decode(WatchPlanCatalog.self, from: data) {
                self.planSessions = catalog.plans.flatMap { $0.sessions }.sorted { $0.order < $1.order }
            }

            if let score = context["recoveryScore"] as? Int, let level = context["recoveryLevel"] as? String {
                self.recoveryScore = score
                self.recoveryLevel = level
            }
        }
    }

    // MARK: - Watch → phone requests

    private enum RequestError: Error, LocalizedError {
        case notReachable
        case serverError(String)
        case timedOut

        var errorDescription: String? {
            switch self {
            case .notReachable: return "iPhone nicht erreichbar"
            case .serverError(let message): return message
            case .timedOut: return "iPhone antwortet nicht — ist die App dort geöffnet?"
            }
        }
    }

    /// Guarantees a callback fires exactly once even when sendMessage's
    /// reply-, error- and our own timeout path race each other.
    private final class Once {
        private let lock = NSLock()
        private var done = false
        func run(_ block: () -> Void) {
            lock.lock()
            defer { lock.unlock() }
            guard !done else { return }
            done = true
            block()
        }
    }

    private func sendRequest(
        type: String,
        fields: [String: Any],
        timeout: TimeInterval = 10,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        guard WCSession.default.isReachable else {
            completion(.failure(RequestError.notReachable))
            return
        }
        let requestId = UUID().uuidString
        var message = fields
        message["type"] = type
        message["requestId"] = requestId

        // sendMessage's errorHandler is not guaranteed to fire promptly (or
        // at all) when the message is delivered but the counterpart never
        // calls the reply handler — e.g. the phone app's WebView is
        // suspended or running a stale bundle. Without our own deadline the
        // UI spinner runs forever, so race a timeout against the reply.
        let once = Once()

        WCSession.default.sendMessage(message, replyHandler: { reply in
            once.run {
                if let error = reply["error"] as? String {
                    completion(.failure(RequestError.serverError(error)))
                } else {
                    completion(.success(reply))
                }
            }
        }, errorHandler: { error in
            once.run { completion(.failure(error)) }
        })

        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
            once.run { completion(.failure(RequestError.timedOut)) }
        }
    }

    /// Starts a plan session's workout on the phone (creates real
    /// Workout/WorkoutExercise/Set rows). Only signals that the request was
    /// accepted — the actual workout data arrives separately via
    /// `updateApplicationContext` (see `activeWorkout` above), since the
    /// phone-side handler does two sequential network calls before it's
    /// ready, which is too slow to reliably ride the sendMessage reply.
    func startSession(_ session: WatchPlanSession, completion: @escaping (Result<Void, Error>) -> Void) {
        sendRequest(type: "startSession", fields: ["sessionId": session.id]) { result in
            switch result {
            case .success:
                completion(.success(()))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    /// Logs a single set's weight/reps and marks it completed.
    func logSet(
        workoutId: String,
        setId: String,
        weight: Double?,
        reps: Int?,
        completion: @escaping (Result<Bool, Error>) -> Void
    ) {
        var fields: [String: Any] = ["workoutId": workoutId, "setId": setId]
        if let weight { fields["weight"] = weight }
        if let reps { fields["reps"] = reps }

        sendRequest(type: "logSet", fields: fields) { result in
            switch result {
            case .success(let reply):
                completion(.success(reply["personalRecord"] as? Bool ?? false))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    /// Persists a +/-15s rest-timer nudge server-side (see
    /// rest-timer-adjust route) so the phone bar and Live Activity pick it up
    /// too — previously this was a purely local overlay on the Watch,
    /// invisible everywhere else. Fire-and-forget from the caller's
    /// perspective: the Watch's own countdown already applied the nudge
    /// optimistically before this was called; the reply just confirms it.
    func adjustRestTimer(workoutId: String, deltaSeconds: Int, completion: @escaping (Result<Void, Error>) -> Void) {
        sendRequest(type: "adjustRestTimer", fields: ["workoutId": workoutId, "deltaSeconds": deltaSeconds]) { result in
            switch result {
            case .success:
                completion(.success(()))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    /// Applies a just-logged set to `activeWorkout` — the single source of
    /// truth every workout view reads from. Keeps the Watch's own optimistic
    /// update and any later authoritative re-push from the phone flowing
    /// through the same property, so the logging list, controls page and
    /// live screen never diverge. Safe to call off the main actor.
    func applyLoggedSet(exerciseId: String, updatedSet: WatchSet) {
        DispatchQueue.main.async {
            guard var workout = self.activeWorkout,
                  let ei = workout.workoutExercises.firstIndex(where: { $0.id == exerciseId }),
                  let si = workout.workoutExercises[ei].sets.firstIndex(where: { $0.id == updatedSet.id })
            else { return }
            workout.workoutExercises[ei].sets[si] = updatedSet
            self.activeWorkout = workout
        }
    }

    /// Marks the workout complete on the phone. Only signals that the
    /// request was accepted — same reasoning as `startSession` above, this
    /// no longer waits on the complete-request to finish before replying, so
    /// there's no `newPersonalRecords` count to report anymore either.
    func finishWorkout(workoutId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        sendRequest(type: "finishWorkout", fields: ["workoutId": workoutId]) { result in
            switch result {
            case .success:
                completion(.success(()))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    /// Asks the phone to recompute the Recovery Score (re-syncing HealthKit
    /// first if the phone app is open — see watch-workout-sync.ts) and
    /// applies the result immediately from the reply, rather than waiting on
    /// the separate `updateApplicationContext` push this same request also
    /// triggers — that push is the reliable channel if this view isn't the
    /// one currently on screen, but for the view that asked, using the
    /// direct reply means the ring updates the moment sendMessage completes.
    func refreshRecovery(completion: @escaping (Result<Void, Error>) -> Void) {
        sendRequest(type: "refreshRecovery", fields: [:]) { result in
            switch result {
            case .success(let reply):
                if let score = reply["score"] as? Int, let level = reply["level"] as? String {
                    DispatchQueue.main.async {
                        self.recoveryScore = score
                        self.recoveryLevel = level
                    }
                }
                completion(.success(()))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    /// Pushes live HR/calories/elapsed/zone to the phone while a
    /// phone-initiated cardio session is running (see
    /// `isPhoneInitiatedCardio`). `sendMessage`, not transferUserInfo or
    /// application context: this needs low latency and we only ever care
    /// about the *latest* reading, never a backlog — and the Watch is
    /// guaranteed reachable here, mid-interactive-session with the phone
    /// that just started it. A dropped update because the Watch was
    /// momentarily unreachable is fine; the next one a few seconds later
    /// catches up.
    func pushCardioLiveUpdate(
        isRunning: Bool,
        heartRate: Double,
        activeCalories: Double,
        elapsedSeconds: Int,
        zone: Int?
    ) {
        guard WCSession.default.isReachable else { return }
        var payload: [String: Any] = [
            "type": "cardioLiveUpdate",
            "isRunning": isRunning,
            "heartRate": heartRate,
            "activeCalories": activeCalories,
            "elapsedSeconds": elapsedSeconds,
        ]
        if let zone { payload["zone"] = zone }
        WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    }

    /// Discards the workout on the phone (deletes it — no partial save).
    func cancelWorkout(workoutId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        pendingCancellation = true
        sendRequest(type: "cancelWorkout", fields: ["workoutId": workoutId]) { result in
            switch result {
            case .success:
                completion(.success(()))
            case .failure(let error):
                self.pendingCancellation = false
                completion(.failure(error))
            }
        }
    }
}

extension PhoneWorkoutObserver: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Pick up whatever context was already set before this session activated
        // (e.g. Watch app launched after the phone workout already started).
        apply(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }

    /// A phone-initiated cancel/finish also fires this (see
    /// clearWorkoutState in WatchConnectivityPlugin.swift) as a
    /// more-reliably-delivered backstop to the application-context push
    /// above, which can lag noticeably behind real time. Ends the workout
    /// here immediately rather than waiting for `apply` to eventually catch
    /// up — a stuck "still active" workout on the Watch otherwise looks
    /// live but 404s the moment anything on it (finish, log a set, adjust
    /// rest) reaches the phone for an already-deleted workout.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleWorkoutClearedIfNeeded(userInfo)
    }

    /// Phone-initiated requests that expect a reply — currently only the
    /// cardio start/stop commands (see WatchConnectivityPlugin.swift's
    /// `sendCardioCommand`). This is the reverse direction of `sendRequest`
    /// above (Watch asks phone, awaits reply); here the *phone* asks the
    /// Watch, and this Watch app is the one replying.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        guard let type = message["type"] as? String else {
            replyHandler(["error": "Missing type"])
            return
        }
        switch type {
        case "startCardio":
            guard let activityType = message["activityType"] as? String else {
                replyHandler(["error": "Missing activityType"])
                return
            }
            guard let handler = onCardioStartRequested else {
                replyHandler(["error": "Watch-App nicht bereit"])
                return
            }
            // WCSession delivers this callback on an arbitrary background
            // queue, but `handler` ultimately calls into WorkoutManager,
            // which is @MainActor — hop explicitly rather than relying on
            // await-a-closure to do it implicitly.
            Task { @MainActor in
                let result = await handler(activityType)
                switch result {
                case .success:
                    self.isPhoneInitiatedCardio = true
                    replyHandler(["started": true])
                case .failure(let message):
                    replyHandler(["error": message])
                }
            }
        case "stopCardio":
            let discard = message["discard"] as? Bool ?? false
            Task { @MainActor in
                self.onCardioStopRequested?(discard)
                self.isPhoneInitiatedCardio = false
                replyHandler(["done": true])
            }
        default:
            replyHandler(["error": "Unbekannter Request-Typ: \(type)"])
        }
    }

    /// Same "workoutCleared" signal as above, delivered instantly via
    /// `sendMessage` instead of transferUserInfo's queue — but only while
    /// the Watch is actually reachable (see WatchConnectivityPlugin.swift),
    /// so transferUserInfo above still has to stay as the guaranteed-
    /// delivery fallback. This is the fast path that stops the HR session
    /// right away instead of whenever the queue happens to flush.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleWorkoutClearedIfNeeded(message)
    }

    private func handleWorkoutClearedIfNeeded(_ payload: [String: Any]) {
        guard payload["type"] as? String == "workoutCleared" else { return }
        DispatchQueue.main.async {
            if let workoutId = payload["workoutId"] as? String {
                // Guards against a still-in-flight application-context push
                // (sent before the cancel, carrying the old workout) landing
                // *after* this and resurrecting it — same guard endWorkoutLocally
                // uses for the Watch-initiated exit paths.
                self.locallyEndedWorkoutIds.insert(workoutId)
            }
            self.activeWorkout = nil
        }
    }
}
