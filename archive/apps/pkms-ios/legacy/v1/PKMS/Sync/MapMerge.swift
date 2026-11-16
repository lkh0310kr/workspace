import Foundation

/// Three-way merge for the JSON files inside a `*.map` folder. Folders and places are matched by
/// `id` and merged field by field, so a color set on the phone and folders added elsewhere both survive.
/// Where both sides changed the same field, this device's value wins; nothing is ever a conflict.
enum MapMerge {
    /// `base` is `nil` for an old conflict whose common version is gone: then every difference
    /// counts as an addition, and a record or field missing on one side is kept from the other.
    static func merge(base: Data?, local: Data, remote: Data) -> Data? {
        guard let localValue = parse(local), let remoteValue = parse(remote) else { return nil }
        let merged = value(base.flatMap(parse), localValue, remoteValue)
        guard let data = try? JSONSerialization.data(
            withJSONObject: merged, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        ) else { return nil }
        return data + Data("\n".utf8)
    }

    /// Whether a JSON file inside a map folder; other files merge as text.
    static func handles(_ path: VaultPath) -> Bool {
        path.pathExtension == "json" && path.parent.isMap
    }

    private static func parse(_ data: Data) -> Any? {
        try? JSONSerialization.jsonObject(with: data)
    }

    private static func value(_ base: Any?, _ local: Any, _ remote: Any) -> Any {
        if same(local, remote) { return local }
        if let base {
            if same(base, local) { return remote }
            if same(base, remote) { return local }
        }
        if let l = local as? [String: Any], let r = remote as? [String: Any] {
            return object(base as? [String: Any], l, r)
        }
        if let l = records(local), let r = records(remote) {
            return recordList(base.flatMap(records), l, r)
        }
        return local
    }

    private static func object(_ base: [String: Any]?, _ local: [String: Any], _ remote: [String: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for key in Set(local.keys).union(remote.keys) {
            let b = base?[key]
            switch (local[key], remote[key]) {
            case let (l?, r?): result[key] = value(b, l, r)
            // Missing on one side: removed there if the other side still has the base value, else added.
            case let (l?, nil): if b == nil || !same(b!, l) { result[key] = l }
            case let (nil, r?): if b == nil || !same(b!, r) { result[key] = r }
            case (nil, nil): break
            }
        }
        return result
    }

    /// Lists of `{"id": …}` records, in this device's order with records added elsewhere slotted
    /// in after the record that precedes them there.
    private static func recordList(_ base: [[String: Any]]?, _ local: [[String: Any]], _ remote: [[String: Any]]) -> [[String: Any]] {
        let baseByID = Dictionary(base?.map { (id(of: $0), $0) } ?? [], uniquingKeysWith: { a, _ in a })
        let remoteByID = Dictionary(remote.map { (id(of: $0), $0) }, uniquingKeysWith: { a, _ in a })
        let localIDs = Set(local.map(id(of:)))

        var result: [[String: Any]] = []
        for record in local {
            let key = id(of: record)
            if let r = remoteByID[key] {
                result.append(value(baseByID[key], record, r) as? [String: Any] ?? record)
            } else if let b = baseByID[key], same(b, record) {
                continue  // deleted elsewhere, untouched here
            } else {
                result.append(record)
            }
        }
        var previous: String?  // the last remote record that's in the result
        for record in remote {
            let key = id(of: record)
            if localIDs.contains(key) {
                if result.contains(where: { id(of: $0) == key }) { previous = key }
                continue
            }
            if let b = baseByID[key], same(b, record) { continue }  // deleted here, untouched elsewhere
            let at = previous.flatMap { p in result.firstIndex { id(of: $0) == p } }.map { $0 + 1 } ?? 0
            result.insert(record, at: at)
            previous = key
        }
        return result
    }

    private static func records(_ value: Any) -> [[String: Any]]? {
        guard let array = value as? [[String: Any]], array.allSatisfy({ $0["id"] != nil }) else { return nil }
        return array
    }

    private static func id(of record: [String: Any]) -> String {
        "\(record["id"] ?? "")"
    }

    private static func same(_ a: Any, _ b: Any) -> Bool {
        (a as AnyObject).isEqual(b)
    }
}
