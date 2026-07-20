import Foundation
import HealthKit
import UserNotifications

/**
 * Native (no-WebView) implementation of the Watch → phone requests
 * (startSession/logSet/finishWorkout/cancelWorkout), so the Watch keeps
 * working even when the phone app isn't open in the foreground — uses the
 * same Bearer-token auth path BackgroundSyncManager already relies on for
 * background HealthKit sync, instead of routing through the JS bridge
 * (onWatchRequest / watch-workout-sync.ts), which needs a live WKWebView.
 *
 * Only kicks in when a token has been saved (Settings → API Tokens → "Für
 * Hintergrund-Sync verwenden"); see
 * WatchConnectivityPlugin.session(_:didReceiveMessage:replyHandler:), which
 * falls back to the JS bridge otherwise.
 *
 * watchOS wakes the phone's WatchConnectivity delegate in the background for
 * an in-range, paired Watch as long as the app hasn't been force-quit by the
 * user (swiped away in the app switcher) — that, and the phone being
 * completely powered off, are the only states no code can work around.
 */

/// Mutual-exclusion gate for offline-workout replay. An actor gives us a
/// data-race-free flag across the many concurrent contexts that trigger a
/// flush; `begin()` returns false when a replay is already running so the
/// caller backs off instead of starting a second, duplicate-creating pass.
private actor FlushGate {
    private var busy = false
    func begin() -> Bool {
        if busy { return false }
        busy = true
        return true
    }
    func end() { busy = false }
}

enum WatchAPIProxy {
    private static let baseURL = "https://fittrack-pro-ashen.vercel.app"
    /// Matches DEFAULT_REST_TIMER in src/lib/constants.ts — the native proxy
    /// has no access to the user's saved preference (that lives in the web
    /// app's own settings, never synced to the Watch), so this is a
    /// reasonable fixed fallback for the no-phone-open path specifically.
    private static let defaultRestSeconds: Double = 180
    /// Installed by WatchConnectivityPlugin so a successful replay can replace
    /// the Watch's local UUID with the server workout payload.
    static var replayContextHandler: ((ContextUpdate) -> Void)?

    enum ContextUpdate {
        case setActiveWorkout(json: String)
        case setRecovery(score: Int, level: String)
        case clear(workoutId: String?)
        /// A Watch-started offline workout's local UUID has just been replaced
        /// by its authoritative server id. The phone WebView may still be on
        /// `/workouts/_?id=<localId>`, which now 404s — it needs to rehang the
        /// route onto `serverWorkoutId` (see OfflineSyncProvider).
        case rekeyWorkout(localId: String, serverWorkoutId: String)
    }

    static func handle(
        type: String,
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        // Covers a process that was force-quit while offline and only wakes
        // now because the Watch sent another request. Do not flush first when
        // this exact request still targets the local UUID: a successful flush
        // would replace it with a server id halfway through this request.
        let targetsPendingLocalWorkout = (message["workoutId"] as? String).map { WatchOfflineWorkoutStore.load()?.id == $0 } ?? false
        if !targetsPendingLocalWorkout { _ = await flushPendingOfflineWorkout() }
        switch type {
        case "startSession":
            return await startSession(message: message, token: token)
        case "logSet":
            return await logSet(message: message, token: token)
        case "adjustRestTimer":
            return await adjustRestTimer(message: message, token: token)
        case "finishWorkout":
            return await finishWorkout(message: message, token: token)
        case "cancelWorkout":
            return await cancelWorkout(message: message, token: token)
        case "refreshRecovery":
            return await refreshRecovery(token: token)
        default:
            return (["error": "Unbekannter Request-Typ: \(type)"], nil)
        }
    }

    // MARK: - Requests

    private static func startSession(
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        guard let sessionId = message["sessionId"] as? String else {
            return (["error": "Missing sessionId"], nil)
        }
        do {
            let started: ApiIdResponse = try await request(
                "/api/plan-sessions/\(sessionId)/start", method: "POST", token: token
            )
            guard let fetched = try await fetchWorkoutPayload(workoutId: started.data.id, token: token) else {
                return (["error": "Konnte Workout nicht kodieren"], nil)
            }
            if let endsAt = computeRestTimerEndsAt(fetched.workout) {
                scheduleRestTimerNotification(endsAt: endsAt)
                RestTimerActivityController.sync(endsAt: endsAt)
            }
            // `workoutJSON` rides the sendMessage REPLY directly — see
            // PhoneWorkoutObserver.startSession, which applies it to
            // `activeWorkout` immediately instead of only waiting on the
            // `updateApplicationContext` push below. That push is
            // Apple-documented as best-effort/coalesced/delayed, and
            // `pushContextToWatch()` swallows failures silently — for an
            // interactive "tap to start" action the user is staring at, that
            // combination meant the phone genuinely started the workout
            // while the Watch never navigated anywhere. The context update
            // stays too, so other already-open Watch screens still pick up
            // the change the way they always have.
            return (["started": true, "workoutJSON": fetched.json], .setActiveWorkout(json: fetched.json))
        } catch {
            guard isTransportError(error) else { return (["error": describeError(error)], nil) }
            return startOfflineSession(sessionId: sessionId)
        }
    }

    private static func logSet(
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        guard let workoutId = message["workoutId"] as? String,
              let setId = message["setId"] as? String else {
            return (["error": "Missing workoutId/setId"], nil)
        }
        var body: [String: Any] = ["isCompleted": true]
        if let weight = message["weight"] as? Double { body["weight"] = weight }
        if let reps = message["reps"] as? Int { body["reps"] = reps }

        if var pending = WatchOfflineWorkoutStore.load(), pending.id == workoutId {
            guard let index = pending.workoutExercises.indices.first(where: {
                pending.workoutExercises[$0].sets.contains(where: { $0.id == setId })
            }), let setIndex = pending.workoutExercises[index].sets.firstIndex(where: { $0.id == setId }) else {
                return (["error": "Set nicht gefunden"], nil)
            }
            pending.workoutExercises[index].sets[setIndex].weight = body["weight"] as? Double
            pending.workoutExercises[index].sets[setIndex].reps = body["reps"] as? Int
            pending.workoutExercises[index].sets[setIndex].isCompleted = true
            pending.workoutExercises[index].sets[setIndex].completedAt = ISO8601DateFormatter().string(from: Date())
            if let queued = pending.queue.firstIndex(where: { $0.kind == .patchSet && $0.clientSetId == setId }) {
                pending.queue[queued] = WatchQueuedOp(kind: .patchSet, clientSetId: setId, weight: body["weight"] as? Double, reps: body["reps"] as? Int, isCompleted: true)
            } else {
                pending.queue.append(WatchQueuedOp(kind: .patchSet, clientSetId: setId, weight: body["weight"] as? Double, reps: body["reps"] as? Int, isCompleted: true))
            }
            WatchOfflineWorkoutStore.save(pending)
            let json = jsonString(buildOfflineWatchWorkoutPayload(pending)) ?? "{}"
            if let endsAt = offlineRestTimerEndsAt(pending) {
                scheduleRestTimerNotification(endsAt: endsAt)
                RestTimerActivityController.sync(endsAt: endsAt)
            } else {
                clearRestTimerEffects()
            }
            return (["personalRecord": false, "workoutJSON": json], .setActiveWorkout(json: json))
        }

        do {
            let result: ApiSetPatchResponse = try await request(
                "/api/workouts/\(workoutId)/sets/\(setId)", method: "PATCH", token: token, body: body
            )
            // Re-fetches the whole workout (rather than patching just this
            // one set locally) so the rest timer — derived purely from the
            // freshest completedAt in the response, see
            // buildWatchWorkoutPayload — reflects this completion, and the
            // pushed context also picks up anything else that changed
            // server-side since the last sync.
            let fetched = try? await fetchWorkoutPayload(workoutId: workoutId, token: token)
            let contextUpdate: ContextUpdate? = fetched.map { .setActiveWorkout(json: $0.json) }
            // Logging a set on the Watch while the phone app isn't open
            // never runs any of the phone's own JS (rest-timer-context.tsx),
            // so nothing schedules the "rest over" notification — this was
            // reported as "no notification at set-end when the phone is
            // off." Scheduled natively here instead, same fixed identifier
            // as the JS path so whichever one runs later cleanly supersedes
            // the other instead of double-firing.
            if let workout = fetched?.workout {
                if let endsAt = computeRestTimerEndsAt(workout) {
                    scheduleRestTimerNotification(endsAt: endsAt)
                    RestTimerActivityController.sync(endsAt: endsAt)
                } else {
                    clearRestTimerEffects()
                }
            }
            return (["personalRecord": result.personalRecord, "workoutJSON": nullable(fetched?.json)], contextUpdate)
        } catch {
            return (["error": describeError(error)], nil)
        }
    }

    /// Persists a +/-15s nudge from the Watch's own rest-timer row so the
    /// phone bar and Live Activity pick it up too (see rest-timer-adjust
    /// route) — this used to be a purely local `adjustSeconds` overlay on the
    /// Watch, invisible everywhere else, reported as "the two timers aren't
    /// connected, adjusting one leaves the other."
    private static func adjustRestTimer(
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        guard let workoutId = message["workoutId"] as? String,
              let deltaSeconds = message["deltaSeconds"] as? Int else {
            return (["error": "Missing workoutId/deltaSeconds"], nil)
        }
        if var pending = WatchOfflineWorkoutStore.load(), pending.id == workoutId {
            pending.restTimerAdjustSeconds += Double(deltaSeconds)
            WatchOfflineWorkoutStore.save(pending)
            let json = jsonString(buildOfflineWatchWorkoutPayload(pending)) ?? "{}"
            if let endsAt = offlineRestTimerEndsAt(pending) {
                scheduleRestTimerNotification(endsAt: endsAt)
                RestTimerActivityController.sync(endsAt: endsAt)
            }
            return (["done": true], .setActiveWorkout(json: json))
        }
        do {
            let _: ApiRestTimerAdjustResponse = try await request(
                "/api/workouts/\(workoutId)/rest-timer-adjust", method: "PATCH", token: token,
                body: ["deltaSeconds": deltaSeconds]
            )
            let fetched = try? await fetchWorkoutPayload(workoutId: workoutId, token: token)
            let contextUpdate: ContextUpdate? = fetched.map { .setActiveWorkout(json: $0.json) }
            if let workout = fetched?.workout, let endsAt = computeRestTimerEndsAt(workout) {
                scheduleRestTimerNotification(endsAt: endsAt)
                RestTimerActivityController.sync(endsAt: endsAt)
            }
            return (["done": true], contextUpdate)
        } catch {
            return (["error": describeError(error)], nil)
        }
    }

    private static func finishWorkout(
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        guard let workoutId = message["workoutId"] as? String else {
            return (["error": "Missing workoutId"], nil)
        }
        if var pending = WatchOfflineWorkoutStore.load(), pending.id == workoutId {
            pending.endedAt = ISO8601DateFormatter().string(from: Date())
            if !pending.queue.contains(where: { $0.kind == .completeWorkout }) {
                pending.queue.append(WatchQueuedOp(kind: .completeWorkout))
            }
            WatchOfflineWorkoutStore.deferTerminalWorkout(pending)
            WatchOfflineWorkoutStore.clear()
            return (["done": true], .clear(workoutId: workoutId))
        }
        do {
            try await requestNoContent("/api/workouts/\(workoutId)/complete", method: "POST", token: token)
            return (["done": true], .clear(workoutId: workoutId))
        } catch {
            return (["error": describeError(error)], nil)
        }
    }

    private static func cancelWorkout(
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        guard let workoutId = message["workoutId"] as? String else {
            return (["error": "Missing workoutId"], nil)
        }
        if var pending = WatchOfflineWorkoutStore.load(), pending.id == workoutId {
            if pending.serverWorkoutId == nil {
                WatchOfflineWorkoutStore.clear()
            } else {
                if !pending.queue.contains(where: { $0.kind == .deleteWorkout }) {
                    pending.queue.removeAll { $0.kind == .completeWorkout }
                    pending.queue.append(WatchQueuedOp(kind: .deleteWorkout))
                }
                WatchOfflineWorkoutStore.deferTerminalWorkout(pending)
                WatchOfflineWorkoutStore.clear()
            }
            return (["done": true], .clear(workoutId: workoutId))
        }
        do {
            try await requestNoContent("/api/workouts/\(workoutId)", method: "DELETE", token: token)
            return (["done": true], .clear(workoutId: workoutId))
        } catch {
            return (["error": describeError(error)], nil)
        }
    }

    /// Recomputes the Recovery Score from whatever's already in the DB and
    /// hands it back both directly (so the Watch shows it immediately,
    /// without waiting on a separate application-context push) and as a
    /// context update (so it also lands if some other screen is what's
    /// currently visible on the Watch). Unlike the JS-bridge path in
    /// watch-workout-sync.ts, this proxy has no access to the Capacitor
    /// HealthKit plugin (that requires a running app/WebView), so it can only
    /// recompute from data already synced — good enough for "phone app isn't
    /// open," where there's nothing newer to pull in anyway.
    private static func refreshRecovery(token: String) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        do {
            let result: ApiRecoveryResponse = try await request(
                "/api/health/recovery", method: "GET", token: token
            )
            let score = result.data.score
            let level = result.data.level
            let contextUpdate: ContextUpdate? = level != "none" ? .setRecovery(score: score, level: level) : nil
            return (["score": score, "level": level], contextUpdate)
        } catch {
            return (["error": describeError(error)], nil)
        }
    }

    // MARK: - Cardio sync (Watch-saved HealthKit workouts → server)

    private static let healthStore = HKHealthStore()

    /// Pushes recent HealthKit workouts to the server — the native
    /// equivalent of syncHealthKitData()'s workout half in healthkit.ts,
    /// runnable without a WebView. Triggered by the Watch's "cardioSaved"
    /// userInfo transfer right after it saves a cardio session (see
    /// WorkoutManager's finishWorkout callback): without this, a Watch-
    /// recorded run only reached the server on the phone app's next
    /// foreground sync, which is additionally rate-limited to every 15
    /// minutes — so finishing a run and immediately checking the phone
    /// showed nothing. Same payload shape as HealthKitPlugin.queryWorkouts,
    /// posted in the HAE envelope /api/health-data already parses.
    static func syncRecentWorkouts(token: String, days: Int = 7) async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        guard let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) else { return }

        let workouts: [HKWorkout] = await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: .strictStartDate)
            let query = HKSampleQuery(
                sampleType: .workoutType(), predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
            ) { _, samples, _ in
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            healthStore.execute(query)
        }
        guard !workouts.isEmpty else { return }

        let iso = ISO8601DateFormatter()
        let payload: [[String: Any]] = workouts.map { w in
            var dict: [String: Any] = [
                "name": w.workoutActivityType.haeDisplayName,
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

        guard let url = URL(string: baseURL + "/api/health-data") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["data": ["workouts": payload]])
        // Best-effort — a failure here is recovered by the phone app's next
        // regular foreground sync; nothing to surface to the Watch.
        _ = try? await URLSession.shared.data(for: req)
    }

    /// Fetches a workout + its previous-session hints and returns the same
    /// JSON shape `syncActiveWorkoutToWatch` pushes from the JS side, ready
    /// to hand to `WCSession.updateApplicationContext`.
    private static func fetchWorkoutPayload(
        workoutId: String, token: String
    ) async throws -> (json: String, workout: ApiWorkout)? {
        let workoutRes: ApiWorkoutResponse = try await request(
            "/api/workouts/\(workoutId)", method: "GET", token: token
        )
        // Best-effort — missing history just means the Watch falls back to
        // its own defaults for not-yet-logged sets.
        let previousLogs: ApiPreviousLogsResponse? = try? await request(
            "/api/workouts/\(workoutId)/previous-logs", method: "GET", token: token
        )
        let payload = buildWatchWorkoutPayload(workout: workoutRes.data, previousLogs: previousLogs?.data)
        guard let json = jsonString(payload) else { return nil }
        return (json, workoutRes.data)
    }

    /// Matches REST_TIMER_NOTIFICATION_ID in local-notifications.ts exactly
    /// (Capacitor's LocalNotifications plugin uses the decimal string of the
    /// numeric id as the UNNotificationRequest identifier) — scheduling here
    /// with the same id means a notification scheduled by one path replaces
    /// rather than duplicates one already scheduled by the other.
    private static let restTimerNotificationId = "424242"

    private static func scheduleRestTimerNotification(endsAt: Double) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [restTimerNotificationId])
        let interval = endsAt - Date().timeIntervalSince1970
        guard interval > 0 else { return }
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized else { return }
            let content = UNMutableNotificationContent()
            content.title = "Rest vorbei"
            content.body = "Zeit fürs nächste Set"
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            let request = UNNotificationRequest(identifier: restTimerNotificationId, content: content, trigger: trigger)
            center.add(request)
        }
    }

    private static func clearRestTimerEffects() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [restTimerNotificationId])
        RestTimerActivityController.clearPendingStart()
        if #available(iOS 16.1, *) {
            RestTimerActivityController.endAll()
        }
    }

    // MARK: - Native Watch offline queue

    private static func startOfflineSession(sessionId: String) -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        if let existing = WatchOfflineWorkoutStore.load() {
            // A completed/cancelled queue remains durable until it can reach
            // the server. It is not an active workout and must never be
            // handed back to the Watch as a fresh session on the next tap.
            // `handle` already flushes before startSession when online; when
            // still offline, keep the terminal operation safe and explain
            // why a new standalone queue cannot be created yet.
            if existing.queue.contains(where: { $0.kind == .completeWorkout || $0.kind == .deleteWorkout }) {
                WatchOfflineWorkoutStore.deferTerminalWorkout(existing)
                WatchOfflineWorkoutStore.clear()
            } else {
                let json = jsonString(buildOfflineWatchWorkoutPayload(existing)) ?? "{}"
                return (["started": true, "workoutJSON": json], .setActiveWorkout(json: json))
            }
        }
        guard let catalog = WatchOfflineWorkoutStore.loadPlanCatalog(),
              let session = catalog.session(id: sessionId) else {
            return (["error": "Plan ist offline nicht verfügbar – bitte einmal mit geöffneter Telefon-App synchronisieren"], nil)
        }

        let iso = ISO8601DateFormatter()
        let pending = PendingOfflineWorkout(
            id: UUID().uuidString,
            planSessionId: session.id,
            name: session.name,
            startedAt: iso.string(from: Date()),
            endedAt: nil,
            workoutExercises: session.exercises.map { template in
                // Last-session sets for this exercise, positionally matched to
                // the new working sets — same shape the online path attaches
                // (buildWatchWorkoutPayload). All template sets are working
                // sets, so set index == working index here.
                let prevSets = catalog.previousLogs?[template.exercise.id]
                return OfflineWorkoutExercise(
                    id: UUID().uuidString,
                    supersetGroup: nil,
                    exercise: template.exercise,
                    sets: (1...max(0, template.targetSets)).map { number in
                        let idx = number - 1
                        let prev = (prevSets != nil && idx < prevSets!.count) ? prevSets![idx] : nil
                        return OfflineWorkoutSet(id: UUID().uuidString, setNumber: number, weight: nil, reps: nil, isWarmup: false, isCompleted: false, completedAt: nil, previousWeight: prev?.weight, previousReps: prev?.reps)
                    }
                )
            },
            restTimerAdjustSeconds: 0,
            queue: [WatchQueuedOp(kind: .postWorkout)],
            serverWorkoutId: nil,
            workoutExerciseIdMap: [:],
            setIdMap: [:]
        )
        WatchOfflineWorkoutStore.save(pending)
        let json = jsonString(buildOfflineWatchWorkoutPayload(pending)) ?? "{}"
        return (["started": true, "workoutJSON": json], .setActiveWorkout(json: json))
    }

    /// Serializes replay so the many independent triggers — OfflineSyncProvider
    /// (mount + `online` + `resume`), OfflineWorkoutReachabilityMonitor,
    /// BackgroundSyncManager, the Capacitor bridge call, and the pre-request
    /// flush in `handle` — can never run two replays at once. Without this,
    /// concurrent flushes each saw a terminal job's `serverWorkoutId == nil`
    /// and each POSTed `plan-sessions/start` before any could persist the
    /// resolved id, creating one duplicate server workout per overlapping
    /// trigger (observed: a single Watch workout replicated ~10×). A trigger
    /// that arrives mid-flush is dropped here; the next trigger (they fire
    /// often) drains whatever it added.
    @discardableResult
    static func flushPendingOfflineWorkout() async -> (ok: Bool, error: String?) {
        guard await flushGate.begin() else { return (true, nil) }
        let result = await performFlush()
        await flushGate.end()
        return result
    }

    private static let flushGate = FlushGate()

    @discardableResult
    private static func performFlush() async -> (ok: Bool, error: String?) {
        guard let token = SyncTokenStore.loadForBackgroundUse() else {
            NSLog("[WatchFlush] no token available, aborting")
            return (false, "Kein Login-Token verfügbar")
        }

        var allSucceeded = true
        var lastError: String?
        let terminalJobs = WatchOfflineWorkoutStore.loadTerminalWorkouts()
        NSLog("[WatchFlush] starting: %d terminal job(s), pending=%@", terminalJobs.count, WatchOfflineWorkoutStore.load() != nil ? "yes" : "no")
        for var terminal in terminalJobs {
            let wasCompleted = terminal.queue.contains { $0.kind == .completeWorkout }
            NSLog("[WatchFlush] terminal job %@ (serverWorkoutId=%@, queue=%d op(s), wasCompleted=%@) — replaying",
                  terminal.id, terminal.serverWorkoutId ?? "nil", terminal.queue.count, wasCompleted ? "yes" : "no")
            do {
                _ = try await replayPendingWorkout(&terminal, token: token) {
                    WatchOfflineWorkoutStore.updateTerminalWorkout($0)
                }
                if wasCompleted {
                    // A completed workout keeps a server record — rehang any
                    // phone view still on its local UUID onto the server id so
                    // it opens the saved workout instead of 404-ing.
                    if let serverWorkoutId = terminal.serverWorkoutId {
                        replayContextHandler?(.rekeyWorkout(localId: terminal.id, serverWorkoutId: serverWorkoutId))
                    }
                    WatchOfflineWorkoutStore.archiveCompletedWorkout(terminal)
                }
                WatchOfflineWorkoutStore.removeTerminalWorkout(id: terminal.id)
                replayContextHandler?(.clear(workoutId: terminal.id))
                NSLog("[WatchFlush] terminal job %@ SUCCEEDED (serverWorkoutId=%@)", terminal.id, terminal.serverWorkoutId ?? "nil")
            } catch {
                // A single failing terminal job (network blip, or a genuinely
                // unreplayable one) must NOT strand every OTHER queued workout
                // behind it: this used to `return false` and abort the whole
                // FIFO on the first error, so one poisoned job at the front
                // blocked all completed workouts from ever uploading. Persist
                // this job's progress, remember to report overall failure, and
                // move on — it's retried on the next flush.
                WatchOfflineWorkoutStore.updateTerminalWorkout(terminal)
                allSucceeded = false
                lastError = describeError(error)
                NSLog("[WatchFlush] terminal job %@ FAILED: %@", terminal.id, lastError ?? "unknown")
                continue
            }
        }

        guard var pending = WatchOfflineWorkoutStore.load() else { return (allSucceeded, lastError) }
        NSLog("[WatchFlush] pending job %@ (serverWorkoutId=%@, queue=%d op(s)) — replaying",
              pending.id, pending.serverWorkoutId ?? "nil", pending.queue.count)
        do {
            let endsWorkoutOnReplay = try await replayPendingWorkout(&pending, token: token) {
                WatchOfflineWorkoutStore.save($0)
            }
            if endsWorkoutOnReplay {
                replayContextHandler?(.clear(workoutId: pending.id))
            } else if let workoutId = pending.serverWorkoutId {
                // The phone may still be viewing this workout under its local
                // UUID, which now 404s — rehang the route onto the server id
                // before it can poll and surface "Workout not found".
                replayContextHandler?(.rekeyWorkout(localId: pending.id, serverWorkoutId: workoutId))
                try await reconcilePendingWorkout(&pending, token: token)
                if let fetched = try await fetchWorkoutPayload(workoutId: workoutId, token: token) {
                replayContextHandler?(.setActiveWorkout(json: fetched.json))
                }
            }
            WatchOfflineWorkoutStore.clear()
            NSLog("[WatchFlush] pending job %@ SUCCEEDED", pending.id)
            return (allSucceeded, lastError)
        } catch {
            WatchOfflineWorkoutStore.save(pending)
            NSLog("[WatchFlush] pending job %@ FAILED: %@", pending.id, describeError(error))
            return (false, describeError(error))
        }
    }

    /// Replays one durable desired-state record. The caller chooses whether
    /// it belongs to the active slot or the terminal FIFO, while this method
    /// commits after every operation so a network loss is safe to retry.
    private static func replayPendingWorkout(
        _ pending: inout PendingOfflineWorkout,
        token: String,
        persist: (PendingOfflineWorkout) -> Void
    ) async throws -> Bool {
        let endsWorkoutOnReplay = pending.queue.contains { $0.kind == .completeWorkout || $0.kind == .deleteWorkout }
        while let op = pending.queue.first {
            switch op.kind {
            case .postWorkout:
                if pending.serverWorkoutId == nil {
                    let started: ApiIdResponse = try await request("/api/plan-sessions/\(pending.planSessionId)/start", method: "POST", token: token)
                    pending.serverWorkoutId = started.data.id
                    guard let fetched = try await fetchWorkoutPayload(workoutId: started.data.id, token: token) else { throw RequestError.decode }
                    var unmatchedServerExercises = fetched.workout.workoutExercises
                    for localExercise in pending.workoutExercises {
                        guard let serverIndex = unmatchedServerExercises.firstIndex(where: {
                            $0.exercise.id == localExercise.exercise.id
                        }) else { continue }
                        let serverExercise = unmatchedServerExercises.remove(at: serverIndex)
                        pending.workoutExerciseIdMap[localExercise.id] = serverExercise.id
                        for (setIndex, localSet) in localExercise.sets.enumerated() where setIndex < serverExercise.sets.count {
                            pending.setIdMap[localSet.id] = serverExercise.sets[setIndex].id
                        }
                    }
                }
            case .patchSet:
                break // desired state is reconciled as a whole below
            case .completeWorkout:
                guard let workoutId = pending.serverWorkoutId else { throw RequestError.decode }
                try await reconcilePendingWorkout(&pending, token: token)
                do {
                    try await requestNoContent("/api/workouts/\(workoutId)/complete", method: "POST", token: token)
                } catch RequestError.http(404) {
                    // The workout was deleted server-side before this completion
                    // replayed (e.g. cleaned up during testing). Nothing left to
                    // complete — treat as done so the job drains instead of
                    // 404-ing forever on every retry. Mirrors the JS flush,
                    // which also ignores a 404 on complete.
                }
            case .deleteWorkout:
                if let workoutId = pending.serverWorkoutId {
                    do {
                        try await requestNoContent("/api/workouts/\(workoutId)", method: "DELETE", token: token)
                    } catch RequestError.http(404) {
                        // The workout is already gone server-side, so this
                        // delete has reached its desired end state. Throwing
                        // here used to abort the entire terminal flush and,
                        // because this job sits at the FRONT of the FIFO, left
                        // every completed workout queued behind it stranded and
                        // never uploaded. Swallow the 404 and let the queue
                        // drain.
                    }
                }
            }
            pending.queue.removeFirst()
            persist(pending)
        }
        return endsWorkoutOnReplay
    }

    /// Applies the native queue's current desired workout shape after its
    /// server workout exists. This makes the phone editor fully usable while
    /// offline (including exercise/set add/remove and reordering) without a
    /// competing JavaScript replay queue.
    private static func reconcilePendingWorkout(_ pending: inout PendingOfflineWorkout, token: String) async throws {
        guard let workoutId = pending.serverWorkoutId else { throw RequestError.decode }
        guard var fetched = try await fetchWorkoutPayload(workoutId: workoutId, token: token) else { throw RequestError.decode }
        var serverExercises = fetched.workout.workoutExercises

        // Remove server exercises that no longer have a desired local peer.
        let desiredExerciseIds = Set(pending.workoutExercises.map(\.id))
        for (localId, serverId) in Array(pending.workoutExerciseIdMap) where !desiredExerciseIds.contains(localId) {
            try await requestNoContent("/api/workouts/\(workoutId)/exercises/\(serverId)", method: "DELETE", token: token)
            pending.workoutExerciseIdMap.removeValue(forKey: localId)
        }
        // A local delete can happen before the initial server workout is ever
        // created, so it has no old local→server mapping yet. Any remaining
        // unmapped initial row is therefore intentionally absent locally.
        let mappedExerciseIds = Set(pending.workoutExerciseIdMap.values)
        for server in serverExercises where !mappedExerciseIds.contains(server.id) {
            try await requestNoContent("/api/workouts/\(workoutId)/exercises/\(server.id)", method: "DELETE", token: token)
        }

        // Add exercise rows that were created from the phone while offline.
        for local in pending.workoutExercises where pending.workoutExerciseIdMap[local.id] == nil {
            let created: ApiIdResponse = try await request(
                "/api/workouts/\(workoutId)/exercises", method: "POST", token: token,
                body: ["exerciseId": local.exercise.id]
            )
            pending.workoutExerciseIdMap[local.id] = created.data.id
        }

        guard let refreshed = try await fetchWorkoutPayload(workoutId: workoutId, token: token) else { throw RequestError.decode }
        fetched = refreshed
        serverExercises = fetched.workout.workoutExercises
        let serverById = Dictionary(uniqueKeysWithValues: serverExercises.map { ($0.id, $0) })

        for localExercise in pending.workoutExercises {
            guard let serverExerciseId = pending.workoutExerciseIdMap[localExercise.id],
                  let serverExercise = serverById[serverExerciseId] else { throw RequestError.decode }
            let desiredSetIds = Set(localExercise.sets.map(\.id))
            for (localSetId, serverSetId) in Array(pending.setIdMap) where !desiredSetIds.contains(localSetId) {
                // Only delete mappings belonging to this exercise. A set id
                // is globally unique, so checking the current server row is
                // sufficient and avoids touching another exercise's sets.
                if serverExercise.sets.contains(where: { $0.id == serverSetId }) {
                    try await requestNoContent("/api/workouts/\(workoutId)/sets/\(serverSetId)", method: "DELETE", token: token)
                    pending.setIdMap.removeValue(forKey: localSetId)
                }
            }
            let mappedServerSetIds = Set(localExercise.sets.compactMap { pending.setIdMap[$0.id] })
            for serverSet in serverExercise.sets where !mappedServerSetIds.contains(serverSet.id) {
                try await requestNoContent("/api/workouts/\(workoutId)/sets/\(serverSet.id)", method: "DELETE", token: token)
            }
            for localSet in localExercise.sets where pending.setIdMap[localSet.id] == nil {
                let created: ApiCreateSetResponse = try await request(
                    "/api/workouts/\(workoutId)/exercises/\(serverExerciseId)/sets", method: "POST", token: token,
                    body: localSet.isWarmup ? ["isWarmup": true] : [:]
                )
                pending.setIdMap[localSet.id] = created.data.set.id
            }
        }

        // Patch every desired set. This is idempotent and also covers
        // Watch-only logs made before the phone editor was opened.
        //
        // These per-set PATCHes are independent writes (each targets a
        // different set row), and doing them one sequential round-trip at a
        // time was the dominant cost of a Watch sync: N × the full network
        // latency. On a real connection that left the freshly-created workout
        // showing as "active" for many seconds before its completion could
        // run — the "erst live, dann finished, und dauert ewig" symptom. Run
        // them concurrently instead; URLSession pools/multiplexes the
        // connections, so this collapses the whole set-write phase to roughly
        // one round-trip. The reorder + complete steps still run strictly
        // after, because the task group is fully awaited here.
        var patchJobs: [(setId: String, body: [String: Any])] = []
        for localExercise in pending.workoutExercises {
            for localSet in localExercise.sets {
                guard let serverSetId = pending.setIdMap[localSet.id] else { throw RequestError.decode }
                var body: [String: Any] = ["isCompleted": localSet.isCompleted]
                if let weight = localSet.weight { body["weight"] = weight }
                if let reps = localSet.reps { body["reps"] = reps }
                patchJobs.append((serverSetId, body))
            }
        }
        try await withThrowingTaskGroup(of: Void.self) { group in
            for job in patchJobs {
                group.addTask {
                    do {
                        let _: ApiSetPatchResponse = try await request("/api/workouts/\(workoutId)/sets/\(job.setId)", method: "PATCH", token: token, body: job.body)
                    } catch RequestError.http(404) {
                        // The set no longer exists server-side (deleted, or a
                        // duplicate cleaned up manually) — nothing left to
                        // patch. Letting this throw used to abort the whole
                        // concurrent batch, which aborts reconcilePendingWorkout,
                        // which aborts replayPendingWorkout — stranding this
                        // workout (and, if it's a terminal job, every workout
                        // queued behind it) in an infinite retry loop. Mirrors
                        // the completeWorkout/deleteWorkout 404 tolerance above
                        // and the JS flush's patch_set/delete_set tolerance.
                    }
                }
            }
            for try await _ in group {}
        }
        let order = pending.workoutExercises.compactMap { pending.workoutExerciseIdMap[$0.id] }
        if order.count == pending.workoutExercises.count {
            try await requestNoContent("/api/workouts/\(workoutId)/exercises/reorder", method: "POST", token: token, body: ["ids": order])
        }
        for localExercise in pending.workoutExercises where localExercise.supersetGroup != nil {
            guard let serverExerciseId = pending.workoutExerciseIdMap[localExercise.id] else { continue }
            try? await requestNoContent(
                "/api/workouts/\(workoutId)/exercises/\(serverExerciseId)", method: "PATCH", token: token,
                body: ["supersetGroup": localExercise.supersetGroup as Any]
            )
        }
    }

    private static func buildOfflineWatchWorkoutPayload(_ pending: PendingOfflineWorkout) -> [String: Any] {
        [
            "id": pending.id,
            "name": pending.name,
            "startedAt": pending.startedAt,
            "restTimerEndsAt": nullable(offlineRestTimerEndsAt(pending)),
            "workoutExercises": pending.workoutExercises.map { exercise in
                [
                    "id": exercise.id,
                    "supersetGroup": nullable(exercise.supersetGroup),
                    "exercise": ["id": exercise.exercise.id, "name": exercise.exercise.name, "muscleGroup": exercise.exercise.muscleGroup],
                    "sets": exercise.sets.map { set in
                        ["id": set.id, "setNumber": set.setNumber, "reps": nullable(set.reps), "weight": nullable(set.weight), "isCompleted": set.isCompleted, "isWarmup": set.isWarmup, "previousWeight": nullable(set.previousWeight), "previousReps": nullable(set.previousReps)]
                    },
                ]
            },
        ]
    }

    private static func offlineRestTimerEndsAt(_ pending: PendingOfflineWorkout) -> Double? {
        let completions = pending.workoutExercises.enumerated().flatMap { exerciseIndex, exercise in
            exercise.sets.compactMap { set in
                set.completedAt.flatMap(parseDate).map { (exerciseIndex, $0.timeIntervalSince1970) }
            }
        }
        let latest = completions.max { $0.1 < $1.1 }
        if let (exerciseIndex, _) = latest,
           let group = pending.workoutExercises[exerciseIndex].supersetGroup,
           pending.workoutExercises.lastIndex(where: { $0.supersetGroup == group }) != exerciseIndex {
            return nil
        }
        let started = parseDate(pending.startedAt)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        return (latest?.1 ?? started) + defaultRestSeconds + pending.restTimerAdjustSeconds
    }

    // MARK: - Networking

    private enum RequestError: Error {
        case http(Int)
        case decode
        case badURL
    }

    private static func isTransportError(_ error: Error) -> Bool {
        if case RequestError.http = error { return false }
        return true
    }

    private static func request<T: Decodable>(
        _ path: String, method: String, token: String, body: [String: Any]? = nil
    ) async throws -> T {
        let data = try await rawRequest(path, method: method, token: token, body: body)
        guard let decoded = try? JSONDecoder().decode(T.self, from: data) else {
            throw RequestError.decode
        }
        return decoded
    }

    private static func requestNoContent(_ path: String, method: String, token: String, body: [String: Any]? = nil) async throws {
        _ = try await rawRequest(path, method: method, token: token, body: body)
    }

    private static func rawRequest(
        _ path: String, method: String, token: String, body: [String: Any]?
    ) async throws -> Data {
        guard let url = URL(string: baseURL + path) else { throw RequestError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            throw RequestError.http((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return data
    }

    private static func describeError(_ error: Error) -> String {
        if case RequestError.http(let status) = error {
            return "Anfrage fehlgeschlagen (\(status))"
        }
        if case RequestError.decode = error {
            // Thrown when a server response's shape didn't match what the
            // replay expected — e.g. a set/exercise count mismatch during id
            // remapping (WatchAPIProxy.reconcilePendingWorkout). Distinct
            // from a plain network failure so a stuck-forever job is
            // diagnosable from the toast alone, without an attached Xcode
            // console.
            return "Antwort nicht wie erwartet (decode)"
        }
        if case RequestError.badURL = error {
            return "Ungültige URL"
        }
        return "Netzwerkfehler: \((error as NSError).localizedDescription)"
    }

    // MARK: - Payload shaping (mirrors toWatchWorkoutPayload in watch-connectivity.ts)

    /// Epoch seconds the rest timer should end at — derived purely from
    /// already-authoritative data in `workout` (most recent set completion,
    /// or the workout's own start if nothing's completed yet), matching
    /// computeRestTimerEndsAt in watch-connectivity.ts exactly. Never
    /// tracked as separate client-side state: that would let this proxy and
    /// the phone's own JS-driven push independently cache stale values and
    /// stomp on whichever one was actually more recent.
    private static func computeRestTimerEndsAt(_ workout: ApiWorkout) -> Double? {
        var anchor = parseDate(workout.startedAt)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        var latestWorkoutExerciseId: String?
        for we in workout.workoutExercises {
            for s in we.sets {
                guard let completedAt = s.completedAt, let t = parseDate(completedAt)?.timeIntervalSince1970 else { continue }
                if t > anchor {
                    anchor = t
                    latestWorkoutExerciseId = we.id
                }
            }
        }
        if let latestWorkoutExerciseId,
           let latest = workout.workoutExercises.first(where: { $0.id == latestWorkoutExerciseId }),
           let group = latest.supersetGroup,
           workout.workoutExercises.lastIndex(where: { $0.supersetGroup == group }) != workout.workoutExercises.firstIndex(where: { $0.id == latestWorkoutExerciseId }) {
            return nil
        }
        return anchor + (workout.restTimerDefaultSeconds ?? defaultRestSeconds) + (workout.restTimerAdjustSeconds ?? 0)
    }

    private static let isoFormatterWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let isoFormatterPlain = ISO8601DateFormatter()

    private static func parseDate(_ iso: String) -> Date? {
        isoFormatterWithFractionalSeconds.date(from: iso) ?? isoFormatterPlain.date(from: iso)
    }

    private static func buildWatchWorkoutPayload(
        workout: ApiWorkout,
        previousLogs: [String: [ApiPreviousSetEntry]?]?
    ) -> [String: Any] {
        let workoutExercises: [[String: Any]] = workout.workoutExercises.map { we in
            // previousLogs values are themselves optional (JSON null when no
            // history exists for that exercise) — flatten the double-optional
            // from chaining through the also-optional dictionary.
            let prevSets: [ApiPreviousSetEntry]? = (previousLogs?[we.exercise.id]).flatMap { $0 }
            // Matched by position among working (non-warmup) sets, same as
            // the phone's own hint and the JS sync path — not by raw
            // setNumber, which drifts whenever either session has a warmup.
            var workingIndex = 0
            let sets: [[String: Any]] = we.sets.map { s in
                var prev: ApiPreviousSetEntry?
                if !s.isWarmup {
                    if let prevSets, workingIndex < prevSets.count { prev = prevSets[workingIndex] }
                    workingIndex += 1
                }
                return [
                    "id": s.id,
                    "setNumber": s.setNumber,
                    "reps": nullable(s.reps),
                    "weight": nullable(s.weight),
                    "isCompleted": s.isCompleted,
                    "isWarmup": s.isWarmup,
                    "previousWeight": nullable(prev?.weight),
                    "previousReps": nullable(prev?.reps),
                ]
            }
            return [
                "id": we.id,
                "supersetGroup": nullable(we.supersetGroup),
                "exercise": [
                    "id": we.exercise.id,
                    "name": we.exercise.name,
                    "muscleGroup": we.exercise.muscleGroup,
                ],
                "sets": sets,
            ]
        }
        return [
            "id": workout.id,
            "name": nullable(workout.name),
            "startedAt": workout.startedAt,
            "restTimerEndsAt": nullable(computeRestTimerEndsAt(workout)),
            "workoutExercises": workoutExercises,
        ]
    }

    /// JSONSerialization needs `NSNull`, not a Swift `nil`, to represent a
    /// JSON `null` — this makes that conversion explicit everywhere instead
    /// of scattering `as Any? ?? NSNull()` throughout the payload builder.
    private static func nullable(_ value: Any?) -> Any {
        value ?? NSNull()
    }

    private static func jsonString(_ obj: [String: Any]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

// MARK: - API response shapes (only the fields this proxy actually needs)

private struct ApiRestTimerAdjustResponse: Decodable { let data: ApiRestTimerAdjust }
private struct ApiRestTimerAdjust: Decodable { let restTimerAdjustSeconds: Int }

private struct ApiIdResponse: Decodable { let data: ApiId }
private struct ApiId: Decodable { let id: String }

private struct ApiRecoveryResponse: Decodable { let data: ApiRecovery }
private struct ApiRecovery: Decodable { let score: Int; let level: String }

private struct ApiWorkoutResponse: Decodable { let data: ApiWorkout }
private struct ApiWorkout: Decodable {
    let id: String
    let name: String?
    let startedAt: String
    let restTimerDefaultSeconds: Double?
    let restTimerAdjustSeconds: Double?
    let workoutExercises: [ApiWorkoutExercise]
}
private struct ApiWorkoutExercise: Decodable {
    let id: String
    let supersetGroup: Int?
    let exercise: ApiExerciseInfo
    let sets: [ApiSetEntry]
}
private struct ApiExerciseInfo: Decodable {
    let id: String
    let name: String
    let muscleGroup: String
}
private struct ApiSetEntry: Decodable {
    let id: String
    let setNumber: Int
    let reps: Int?
    let weight: Double?
    let isCompleted: Bool
    let isWarmup: Bool
    let completedAt: String?
}

private struct ApiPreviousLogsResponse: Decodable { let data: [String: [ApiPreviousSetEntry]?] }
private struct ApiPreviousSetEntry: Decodable {
    let setNumber: Int
    let weight: Double?
    let reps: Int?
}

private struct ApiSetPatchResponse: Decodable {
    let personalRecord: Bool
}
private struct ApiCreateSetResponse: Decodable {
    let data: ApiCreatedSet
}
private struct ApiCreatedSet: Decodable { let set: ApiId }

private extension HKWorkoutActivityType {
    /// Same mapping as HealthKitPlugin.displayName (fileprivate there) — the
    /// English Apple Health names cardio.ts/cardio-config.ts match against.
    var haeDisplayName: String {
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
