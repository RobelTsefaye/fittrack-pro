import Foundation

/// One cardio live sample, relayed from `WatchConnectivityPlugin`'s
/// `cardioLiveUpdate` handler to whoever wants to render it — currently the
/// JS bridge (`notifyListeners`, unchanged) and `CardioPictureInPicturePlugin`.
struct CardioLiveSample {
    let isRunning: Bool
    let heartRate: Double
    let activeCalories: Double
    let elapsedSeconds: Int
    let zone: Int?
}

/// In-process pub/sub for the Watch's live cardio push, entirely independent
/// of the JS bridge.
///
/// The PiP window must keep updating while this app is backgrounded (that's
/// the whole point — the user is looking at a different app in the
/// foreground). Once backgrounded, WKWebView suspends JS execution almost
/// immediately regardless of any `UIBackgroundModes` entitlement — those
/// entitlements extend *native* code's background runtime, not the web
/// content process's. So `CardioPictureInPicturePlugin` cannot rely on a
/// "JS receives cardioLiveUpdate → calls back into the plugin" round trip
/// once the app leaves the foreground; it subscribes here instead, and
/// `WatchConnectivityPlugin` publishes directly from its `WCSessionDelegate`
/// callback (native-to-native, no WebView involved).
final class CardioLiveRelay {
    static let shared = CardioLiveRelay()
    private init() {}

    private var subscribers: [UUID: (CardioLiveSample) -> Void] = [:]
    private let lock = NSLock()

    /// The most recent sample, so a subscriber that starts observing between
    /// two Watch pushes (e.g. CardioPictureInPicturePlugin.start()) has
    /// something to render immediately instead of a blank frame for up to ~1s.
    private(set) var lastSample: CardioLiveSample?

    @discardableResult
    func subscribe(_ handler: @escaping (CardioLiveSample) -> Void) -> UUID {
        lock.lock()
        defer { lock.unlock() }
        let id = UUID()
        subscribers[id] = handler
        return id
    }

    func unsubscribe(_ id: UUID) {
        lock.lock()
        defer { lock.unlock() }
        subscribers.removeValue(forKey: id)
    }

    func publish(_ sample: CardioLiveSample) {
        lock.lock()
        lastSample = sample
        let handlers = Array(subscribers.values)
        lock.unlock()
        for handler in handlers {
            handler(sample)
        }
    }
}
