import Foundation
import HealthKit

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
enum WatchAPIProxy {
    private static let baseURL = "https://fittrack-pro-ashen.vercel.app"
    /// Matches DEFAULT_REST_TIMER in src/lib/constants.ts — the native proxy
    /// has no access to the user's saved preference (that lives in the web
    /// app's own settings, never synced to the Watch), so this is a
    /// reasonable fixed fallback for the no-phone-open path specifically.
    private static let defaultRestSeconds: Double = 90

    enum ContextUpdate {
        case setActiveWorkout(json: String)
        case setRecovery(score: Int, level: String)
        case clear
    }

    static func handle(
        type: String,
        message: [String: Any],
        token: String
    ) async -> (reply: [String: Any], contextUpdate: ContextUpdate?) {
        switch type {
        case "startSession":
            return await startSession(message: message, token: token)
        case "logSet":
            return await logSet(message: message, token: token)
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
            guard let json = try await fetchWorkoutPayloadJSON(workoutId: started.data.id, token: token) else {
                return (["error": "Konnte Workout nicht kodieren"], nil)
            }
            return (["started": true], .setActiveWorkout(json: json))
        } catch {
            return (["error": describeError(error)], nil)
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
            let contextUpdate: ContextUpdate? = (try? await fetchWorkoutPayloadJSON(
                workoutId: workoutId, token: token
            )).flatMap { $0 }.map { .setActiveWorkout(json: $0) }
            return (["personalRecord": result.personalRecord], contextUpdate)
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
        do {
            try await requestNoContent("/api/workouts/\(workoutId)/complete", method: "POST", token: token)
            return (["done": true], .clear)
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
        do {
            try await requestNoContent("/api/workouts/\(workoutId)", method: "DELETE", token: token)
            return (["done": true], .clear)
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
    private static func fetchWorkoutPayloadJSON(workoutId: String, token: String) async throws -> String? {
        let workoutRes: ApiWorkoutResponse = try await request(
            "/api/workouts/\(workoutId)", method: "GET", token: token
        )
        // Best-effort — missing history just means the Watch falls back to
        // its own defaults for not-yet-logged sets.
        let previousLogs: ApiPreviousLogsResponse? = try? await request(
            "/api/workouts/\(workoutId)/previous-logs", method: "GET", token: token
        )
        let payload = buildWatchWorkoutPayload(workout: workoutRes.data, previousLogs: previousLogs?.data)
        return jsonString(payload)
    }

    // MARK: - Networking

    private enum RequestError: Error {
        case http(Int)
        case decode
        case badURL
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

    private static func requestNoContent(_ path: String, method: String, token: String) async throws {
        _ = try await rawRequest(path, method: method, token: token, body: nil)
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
        return "Netzwerkfehler"
    }

    // MARK: - Payload shaping (mirrors toWatchWorkoutPayload in watch-connectivity.ts)

    /// Epoch seconds the rest timer should end at — derived purely from
    /// already-authoritative data in `workout` (most recent set completion,
    /// or the workout's own start if nothing's completed yet), matching
    /// computeRestTimerEndsAt in watch-connectivity.ts exactly. Never
    /// tracked as separate client-side state: that would let this proxy and
    /// the phone's own JS-driven push independently cache stale values and
    /// stomp on whichever one was actually more recent.
    private static func computeRestTimerEndsAt(_ workout: ApiWorkout) -> Double {
        var anchor = parseDate(workout.startedAt)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        for we in workout.workoutExercises {
            for s in we.sets {
                guard let completedAt = s.completedAt, let t = parseDate(completedAt)?.timeIntervalSince1970 else { continue }
                if t > anchor { anchor = t }
            }
        }
        return anchor + (workout.restTimerDefaultSeconds ?? defaultRestSeconds)
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
            "restTimerEndsAt": computeRestTimerEndsAt(workout),
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
    let workoutExercises: [ApiWorkoutExercise]
}
private struct ApiWorkoutExercise: Decodable {
    let id: String
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
