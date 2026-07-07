import UIKit
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
    }
}
