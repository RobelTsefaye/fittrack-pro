import Foundation

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

    enum ContextUpdate {
        case setActiveWorkout(json: String)
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
            let workoutRes: ApiWorkoutResponse = try await request(
                "/api/workouts/\(started.data.id)", method: "GET", token: token
            )
            // Best-effort — a freshly started session usually has no prior
            // sessions with this exact combination of exercises yet.
            let previousLogs: ApiPreviousLogsResponse? = try? await request(
                "/api/workouts/\(started.data.id)/previous-logs", method: "GET", token: token
            )
            let payload = buildWatchWorkoutPayload(
                workout: workoutRes.data,
                previousLogs: previousLogs?.data,
                restTimerEndsAt: nil
            )
            guard let json = jsonString(payload) else {
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
            return (["personalRecord": result.personalRecord], nil)
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

    private static func buildWatchWorkoutPayload(
        workout: ApiWorkout,
        previousLogs: [String: [ApiPreviousSetEntry]?]?,
        restTimerEndsAt: Double?
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
            "restTimerEndsAt": nullable(restTimerEndsAt),
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

private struct ApiWorkoutResponse: Decodable { let data: ApiWorkout }
private struct ApiWorkout: Decodable {
    let id: String
    let name: String?
    let startedAt: String
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
