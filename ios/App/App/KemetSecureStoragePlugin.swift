import Foundation
import Security
import Capacitor

@objc(KemetSecureStoragePlugin)
public class KemetSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KemetSecureStoragePlugin"
    public let jsName = "KemetSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]
    private let service = "com.microsolution.kwaiter3.secure"

    @objc func get(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Secure storage read failed", "KEYCHAIN_READ_\(status)"); return
        }
        call.resolve(["value": value])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = validKey(call), let value = call.getString("value"),
              let data = value.data(using: .utf8) else {
            if call.getString("value") == nil { call.reject("value is required") }
            return
        }
        let query = baseQuery(key)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { call.resolve(); return }
        if updateStatus != errSecItemNotFound {
            call.reject("Secure storage write failed", "KEYCHAIN_UPDATE_\(updateStatus)"); return
        }
        var insert = query
        update.forEach { insert[$0.key] = $0.value }
        let insertStatus = SecItemAdd(insert as CFDictionary, nil)
        insertStatus == errSecSuccess
            ? call.resolve()
            : call.reject("Secure storage write failed", "KEYCHAIN_ADD_\(insertStatus)")
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() }
        else { call.reject("Secure storage remove failed", "KEYCHAIN_DELETE_\(status)") }
    }

    @objc func clear(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() }
        else { call.reject("Secure storage clear failed", "KEYCHAIN_CLEAR_\(status)") }
    }

    private func validKey(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= 180 else {
            call.reject("valid key is required"); return nil
        }
        return key
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }
}
