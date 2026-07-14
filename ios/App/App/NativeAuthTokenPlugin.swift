import Foundation
import Capacitor
import Security

/**
 * Keychain-backed storage for the native app's OWN login token — see
 * project-docs/offline-first-roadmap.md Phase 1.
 *
 * Deliberately separate from SyncTokenStore/SyncTokenPlugin (the existing
 * "Für Hintergrund-Sync verwenden" token): that one is an opt-in convenience
 * a user manually creates in Settings so native background code (WatchAPIProxy,
 * CardioPictureInPicturePlugin) can make requests without a live WebView.
 * This one is the app's actual sign-in credential once static export removes
 * the server session cookie entirely — every native install has one after
 * logging in, and (unlike the background-sync token) JS reads it back via
 * `load()` to attach `Authorization: Bearer <token>` to its own fetch calls.
 * Keeping them separate avoids entangling "opted into background sync" with
 * "is logged in" — two different questions that happened to reuse the same
 * ApiToken/Bearer mechanism server-side.
 */
enum NativeAuthTokenStore {
    private static let service = "com.robeltsefaye.fittrackpro.native-auth-token"
    private static let account = "current"

    static func save(_ token: String) -> Bool {
        guard let data = token.data(using: .utf8) else { return false }
        // Remove any existing item first — SecItemAdd fails with
        // errSecDuplicateItem if one's already there from a previous login.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(addQuery as CFDictionary, nil) == errSecSuccess
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8)
        else { return nil }
        return token
    }

    @discardableResult
    static func clear() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

@objc(NativeAuthTokenPlugin)
public class NativeAuthTokenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAuthTokenPlugin"
    public let jsName = "NativeAuthToken"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    @objc func save(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else {
            call.reject("Missing token")
            return
        }
        call.resolve(["success": NativeAuthTokenStore.save(token)])
    }

    @objc func load(_ call: CAPPluginCall) {
        call.resolve(["token": NativeAuthTokenStore.load() as Any])
    }

    @objc func clear(_ call: CAPPluginCall) {
        call.resolve(["success": NativeAuthTokenStore.clear()])
    }
}
