import Foundation
import Security

enum TokenStore {
    private static let service = "com.refine.writing.device-token"
    private static let account = "mobileToken"
    private static var accessGroup: String? {
        Bundle.main.object(forInfoDictionaryKey: "RefineKeychainAccessGroup") as? String
    }

    static func load(legacy: String? = nil) -> String {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        var result: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
           let data = result as? Data, let token = String(data: data, encoding: .utf8) { return token }
        if let legacy, !legacy.isEmpty, save(legacy) {
            UserDefaults(suiteName: "group.com.refine.writing")?.removeObject(forKey: "mobileToken")
            return legacy
        }
        return ""
    }

    @discardableResult
    static func save(_ token: String) -> Bool {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        SecItemDelete(query as CFDictionary)
        guard !token.isEmpty else { return true }
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }
}
