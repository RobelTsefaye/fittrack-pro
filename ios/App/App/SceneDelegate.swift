import UIKit
import Capacitor

/**
 * UIScene lifecycle adoption. Two reasons this exists:
 *
 * 1. On iPadOS 26's scene-centric window system, system-window requests from
 *    legacy (UIApplicationDelegate-only) apps can be silently annulled by
 *    SpringBoard — observed as `startPictureInPicture()` producing no
 *    willStart/didStart/failedToStart callback at all while every documented
 *    prerequisite (audio session, background mode, layer, timebase,
 *    isPictureInPicturePossible == true) is satisfied, plus a
 *    `BSActionErrorDomain code 6 "anulled"` snapshot error in the console.
 * 2. The legacy lifecycle is deprecated anyway: iOS 26 warns at launch
 *    ("UIScene lifecycle will soon be required"), and building with the
 *    iOS 27 SDK will make non-scene apps assert on launch.
 *
 * The window itself comes from Main.storyboard via `UISceneStoryboardFile`
 * in the scene manifest — UIKit instantiates it and the root
 * MainViewController automatically; nothing to wire up here.
 *
 * Deep links and universal links move from UIApplicationDelegate to the
 * scene delegate in a scene-based app, so both are forwarded to Capacitor's
 * ApplicationDelegateProxy from here (both at launch via connectionOptions
 * and while running).
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        for context in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
        for activity in connectionOptions.userActivities {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared, continue: activity, restorationHandler: { _ in }
            )
        }
    }

    /// In a scene-based app UIApplicationDelegate.applicationDidEnterBackground
    /// is no longer delivered — the BGTask scheduling moves here.
    func sceneDidEnterBackground(_ scene: UIScene) {
        BackgroundSyncManager.schedule()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared, continue: userActivity, restorationHandler: { _ in }
        )
    }
}
