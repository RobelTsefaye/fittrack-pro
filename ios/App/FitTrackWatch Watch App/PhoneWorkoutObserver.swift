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
    @Published var isPhoneWorkoutActive = false
    @Published var exerciseName = ""
    @Published var currentSet = 0
    @Published var totalSets = 0
    @Published var weight: Double?
    @Published var reps: Int?

    /// Strength-training plan catalog pushed from the phone, backing the
    /// standalone Kraft session picker. Empty until the phone app has synced
    /// at least once (see watch-workout-sync.ts on the phone side).
    @Published var planSessions: [WatchPlanSession] = []

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
            self.isPhoneWorkoutActive = active
            if active {
                self.exerciseName = context["exerciseName"] as? String ?? ""
                self.currentSet = context["currentSet"] as? Int ?? 0
                self.totalSets = context["totalSets"] as? Int ?? 0
                self.weight = context["weight"] as? Double
                self.reps = context["reps"] as? Int
            }

            if let catalogJSON = context["planCatalog"] as? String,
               let data = catalogJSON.data(using: .utf8),
               let catalog = try? JSONDecoder().decode(WatchPlanCatalog.self, from: data) {
                self.planSessions = catalog.plans.flatMap { $0.sessions }.sorted { $0.order < $1.order }
            }
        }
    }

    // MARK: - Watch → phone requests

    private enum RequestError: Error, LocalizedError {
        case notReachable
        case serverError(String)

        var errorDescription: String? {
            switch self {
            case .notReachable: return "iPhone nicht erreichbar"
            case .serverError(let message): return message
            }
        }
    }

    private func sendRequest(
        type: String,
        fields: [String: Any],
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

        WCSession.default.sendMessage(message, replyHandler: { reply in
            if let error = reply["error"] as? String {
                completion(.failure(RequestError.serverError(error)))
            } else {
                completion(.success(reply))
            }
        }, errorHandler: { error in
            completion(.failure(error))
        })
    }

    /// Starts a plan session's workout on the phone (creates real
    /// Workout/WorkoutExercise/Set rows) and returns the fully-detailed
    /// workout for the logging UI.
    func startSession(_ session: WatchPlanSession, completion: @escaping (Result<WatchActiveWorkout, Error>) -> Void) {
        sendRequest(type: "startSession", fields: ["sessionId": session.id]) { result in
            switch result {
            case .success(let reply):
                guard let workoutData = reply["workout"] else {
                    completion(.failure(RequestError.serverError("Keine Workout-Daten erhalten")))
                    return
                }
                do {
                    let data = try JSONSerialization.data(withJSONObject: workoutData)
                    let workout = try JSONDecoder().decode(WatchActiveWorkout.self, from: data)
                    completion(.success(workout))
                } catch {
                    completion(.failure(error))
                }
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

    /// Marks the workout complete on the phone.
    func finishWorkout(workoutId: String, completion: @escaping (Result<Int, Error>) -> Void) {
        sendRequest(type: "finishWorkout", fields: ["workoutId": workoutId]) { result in
            switch result {
            case .success(let reply):
                completion(.success(reply["newPersonalRecords"] as? Int ?? 0))
            case .failure(let error):
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
}
