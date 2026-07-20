import Foundation

/// Debounced target-zone enter/leave detection. Fed once per second from
/// WorkoutManager's timer tick (not from raw HR samples — those arrive
/// irregularly; the tick gives the debounce a clock, and pausing the workout
/// stops the ticks for free).
@MainActor
final class CardioZoneMonitor {
    enum Event { case enteredZone, leftZone }

    private let targetZone: Int
    private let debounceTicks: Int
    private var confirmedInZone = false
    private var candidateInZone: Bool?
    private var candidateTicks = 0

    init(targetZone: Int, debounceTicks: Int = 5) {
        self.targetZone = targetZone
        self.debounceTicks = debounceTicks
    }

    func evaluate(currentZone: Int?) -> Event? {
        let nowIn = currentZone == targetZone
        if nowIn == confirmedInZone {
            candidateInZone = nil
            candidateTicks = 0
            return nil
        }
        if candidateInZone == nowIn {
            candidateTicks += 1
        } else {
            candidateInZone = nowIn
            candidateTicks = 1
        }
        guard candidateTicks >= debounceTicks else { return nil }
        confirmedInZone = nowIn
        candidateInZone = nil
        candidateTicks = 0
        return nowIn ? .enteredZone : .leftZone
    }
}
