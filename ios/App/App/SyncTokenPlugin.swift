import Foundation
import Capacitor

/**
 * JS-facing bridge for storing/clearing the API token BackgroundSyncManager
 * uses to authenticate with /api/health-data outside of a WKWebView session
 * (background tasks have no cookies). Called from Settings once the user
 * pastes/generates a token — see src/lib/native/sync-token.ts.
 */
@objc(SyncTokenPlugin)
public class SyncTokenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SyncTokenPlugin"
    public let jsName = "SyncToken"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "store", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    @objc func store(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("Missing 'token'")
            return
        }
        SyncTokenStore.save(token)
        BackgroundSyncManager.schedule()
        call.resolve()
    }

    @objc func hasToken(_ call: CAPPluginCall) {
        call.resolve(["hasToken": SyncTokenStore.load() != nil])
    }

    @objc func clear(_ call: CAPPluginCall) {
        SyncTokenStore.clear()
        call.resolve()
    }
}
