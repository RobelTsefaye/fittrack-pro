import Foundation
import Capacitor
import LocalAuthentication

/**
 * Face ID / Touch ID app-lock gate. The web layer (native-app-lock.tsx)
 * calls `authenticate()` once on cold launch and again every time the app
 * returns to the foreground, rendering a blocking lock screen until it
 * resolves successfully. No-ops entirely on web/PWA since this plugin simply
 * doesn't exist there (Capacitor.isNativePlatform() guard on the JS side).
 */
@objc(BiometricLockPlugin)
public class BiometricLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricLockPlugin"
    public let jsName = "BiometricLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        call.resolve(["available": available])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?

        // Fall back to passcode if biometrics aren't enrolled/available (e.g.
        // Face ID temporarily disabled after too many failed attempts) rather
        // than hard-locking the user out of their own app.
        let policy: LAPolicy = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
            ? .deviceOwnerAuthenticationWithBiometrics
            : .deviceOwnerAuthentication

        guard context.canEvaluatePolicy(policy, error: &error) else {
            call.reject(error?.localizedDescription ?? "Biometrische Authentifizierung nicht verfügbar")
            return
        }

        context.evaluatePolicy(policy, localizedReason: "Entsperre FitTrack Pro") { success, evalError in
            if success {
                call.resolve(["success": true])
            } else {
                call.reject(evalError?.localizedDescription ?? "Authentifizierung fehlgeschlagen", nil, evalError)
            }
        }
    }
}
