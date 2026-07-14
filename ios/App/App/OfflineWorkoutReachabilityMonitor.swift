import Foundation
import Network

/// Replays a queued Watch workout when iOS reports connectivity again. This
/// works in the background, subject to the normal iOS force-quit limitation.
final class OfflineWorkoutReachabilityMonitor {
    static let shared = OfflineWorkoutReachabilityMonitor()
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.robeltsefaye.fittrackpro.watch-offline-reachability")
    private var started = false

    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied, SyncTokenStore.loadForBackgroundUse() != nil else { return }
            Task { _ = await WatchAPIProxy.flushPendingOfflineWorkout() }
        }
        monitor.start(queue: queue)
    }
}
