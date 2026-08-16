import Foundation
import SQLite3
import Capacitor

@objc(KemetDatabasePlugin)
public class KemetDatabasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KemetDatabasePlugin"
    public let jsName = "KemetDatabase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "put", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "delete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]
    private let queue = DispatchQueue(label: "com.microsolution.kwaiter3.database")
    private let allowedStores = Set(["keyvalue", "drafts", "syncQueue", "cache", "receipts", "printJobs"])
    private var database: OpaquePointer?
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    public override func load() {
        queue.sync { _ = openDatabase() }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let values = validated(call, needsKey: true) else { return }
        queue.async {
            guard self.openDatabase(), let db = self.database else { call.reject("Local database unavailable"); return }
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            guard sqlite3_prepare_v2(db, "SELECT value FROM local_records WHERE store_name = ? AND record_key = ? LIMIT 1", -1, &statement, nil) == SQLITE_OK else { call.reject("Local database read failed"); return }
            self.bind(values.store, at: 1, in: statement)
            self.bind(values.key!, at: 2, in: statement)
            if sqlite3_step(statement) == SQLITE_ROW, let text = sqlite3_column_text(statement, 0) {
                call.resolve(["value": String(cString: text)])
            } else { call.resolve(["value": NSNull()]) }
        }
    }

    @objc func put(_ call: CAPPluginCall) {
        guard let values = validated(call, needsKey: true), let value = call.getString("value") else {
            if call.getString("value") == nil { call.reject("value is required") }
            return
        }
        queue.async {
            guard self.openDatabase(), let db = self.database else { call.reject("Local database unavailable"); return }
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            let sql = "INSERT INTO local_records(store_name, record_key, value, updated_at) VALUES(?,?,?,?) ON CONFLICT(store_name, record_key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
            guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { call.reject("Local database write failed"); return }
            self.bind(values.store, at: 1, in: statement); self.bind(values.key!, at: 2, in: statement); self.bind(value, at: 3, in: statement)
            sqlite3_bind_int64(statement, 4, Int64(Date().timeIntervalSince1970 * 1000))
            sqlite3_step(statement) == SQLITE_DONE ? call.resolve() : call.reject("Local database write failed")
        }
    }

    @objc func delete(_ call: CAPPluginCall) {
        guard let values = validated(call, needsKey: true) else { return }
        execute("DELETE FROM local_records WHERE store_name = ? AND record_key = ?", values: [values.store, values.key!], call: call)
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard let values = validated(call, needsKey: false) else { return }
        execute("DELETE FROM local_records WHERE store_name = ?", values: [values.store], call: call)
    }

    @objc func list(_ call: CAPPluginCall) {
        guard let values = validated(call, needsKey: false) else { return }
        queue.async {
            guard self.openDatabase(), let db = self.database else { call.reject("Local database unavailable"); return }
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            guard sqlite3_prepare_v2(db, "SELECT value FROM local_records WHERE store_name = ? ORDER BY updated_at ASC", -1, &statement, nil) == SQLITE_OK else { call.reject("Local database list failed"); return }
            self.bind(values.store, at: 1, in: statement)
            var result: [String] = []
            while sqlite3_step(statement) == SQLITE_ROW {
                if let text = sqlite3_column_text(statement, 0) { result.append(String(cString: text)) }
            }
            call.resolve(["values": result])
        }
    }

    private func execute(_ sql: String, values: [String], call: CAPPluginCall) {
        queue.async {
            guard self.openDatabase(), let db = self.database else { call.reject("Local database unavailable"); return }
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { call.reject("Local database operation failed"); return }
            for (index, value) in values.enumerated() { self.bind(value, at: Int32(index + 1), in: statement) }
            sqlite3_step(statement) == SQLITE_DONE ? call.resolve() : call.reject("Local database operation failed")
        }
    }

    private func validated(_ call: CAPPluginCall, needsKey: Bool) -> (store: String, key: String?)? {
        guard let store = call.getString("store"), allowedStores.contains(store) else { call.reject("invalid store"); return nil }
        if !needsKey { return (store, nil) }
        guard let key = call.getString("key"), !key.isEmpty, key.count <= 240 else { call.reject("valid key is required"); return nil }
        return (store, key)
    }

    private func bind(_ value: String, at index: Int32, in statement: OpaquePointer?) {
        sqlite3_bind_text(statement, index, value, -1, transient)
    }

    private func openDatabase() -> Bool {
        if database != nil { return true }
        guard let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return false }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let path = directory.appendingPathComponent("k_waiter_3.sqlite").path
        guard sqlite3_open_v2(path, &database, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let db = database else { return false }
        sqlite3_busy_timeout(db, 5000)
        let sql = "CREATE TABLE IF NOT EXISTS local_records (store_name TEXT NOT NULL, record_key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(store_name, record_key)); CREATE INDEX IF NOT EXISTS local_records_store_updated ON local_records(store_name, updated_at);"
        return sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK
    }
}
