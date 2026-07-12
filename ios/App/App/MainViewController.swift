import UIKit
import WebKit
import Capacitor

/**
 * Capacitor bridge view controller subclass. App-target plugins (HealthKit,
 * RestTimerActivity) are registered EXPLICITLY here rather than relying on
 * Capacitor's automatic `CAPBridgedPlugin` runtime discovery, which proved
 * unreliable for plugins compiled into the main app target in this SPM-based
 * setup (they surfaced as `UNIMPLEMENTED` on the JS bridge while SPM-package
 * plugins like PushNotifications registered fine).
 *
 * Wired up via Main.storyboard (customClass = MainViewController, module App).
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(RestTimerActivityPlugin())
        bridge?.registerPluginInstance(WatchConnectivityPlugin())
        bridge?.registerPluginInstance(SyncTokenPlugin())
        bridge?.registerPluginInstance(SharedDataPlugin())
        bridge?.registerPluginInstance(CardioPictureInPicturePlugin())
        bridge?.registerPluginInstance(NativeAuthTokenPlugin())

        // Disable WKWebView's built-in long-press "Peek" link preview (the
        // Safari-style pop-up with Open/Copy/Share). It's WebKit's default
        // link-interaction behavior and is the single biggest tell that this
        // is a wrapped website rather than a native app — nothing in the web
        // layer can turn it off, it has to be disabled on the WKWebView itself.
        bridge?.webView?.allowsLinkPreview = false
    }
}
