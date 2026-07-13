import Foundation
import Security

/**
 * Stores the FitTrack Pro API token (created in Settings → API Tokens, the
 * same `ftp_…` token used for AI endpoints / /api/export) in the Keychain so
 * BackgroundSyncManager can authenticate a background HealthKit sync without
 * needing an active WKWebView session cookie. The web layer writes this once
 * via SyncTokenPlugin.storeToken after the user pastes/generates a token in
 * Settings.
 */
enum SyncTokenStore {
    private static let service = "com.robeltsefaye.fittrackpro.synctoken"
    private static let account = "api-token"

    static func save(_ token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
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
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Token to use for native/background authenticated requests (Watch replay,
    /// background HealthKit sync, cardio proxy). The dedicated background-sync
    /// token above is *opt-in* — a user only has one after manually enabling
    /// "Für Hintergrund-Sync verwenden" in Settings. Every logged-in native
    /// install, however, already has a valid `NativeAuthTokenStore` login token
    /// that the server accepts as an identical `Authorization: Bearer` API
    /// token. Falling back to it means Watch-started offline workouts actually
    /// upload for every signed-in user instead of silently staying queued
    /// forever (the workout never reaches the server → "Workout not found")
    /// whenever background sync was never explicitly enabled.
    static func loadForBackgroundUse() -> String? {
        return load() ?? NativeAuthTokenStore.load()
    }
}
