package dev.pkms.datanode

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.system.Os
import android.system.OsConstants
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID

internal data class Mutation(
    val namespace: String,
    val key: String,
    val value: String,
    val expectedVersion: Long? = null,
)

internal data class CommitResult(val revision: Long, val replayed: Boolean)

internal class VersionConflict(message: String) : Exception(message)
internal class IdempotencyConflict(message: String) : Exception(message)
internal class ObjectUnavailable(message: String) : Exception(message)
internal enum class ObjectCrashPoint { AFTER_STAGING_SYNC, AFTER_PUBLISH }

internal class DataNodeStore(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    File(context.filesDir, "data-node/node.sqlite").apply { parentFile?.mkdirs() }.absolutePath,
    null,
    DATABASE_VERSION,
) {
    private val root = File(context.filesDir, "data-node").apply { mkdirs() }
    private val objects = File(root, "objects").apply { mkdirs() }
    private val staging = File(root, "staging").apply { mkdirs() }

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
        db.enableWriteAheadLogging()
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE records(namespace TEXT NOT NULL, record_key TEXT NOT NULL, value_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(namespace, record_key))")
        db.execSQL("CREATE TABLE operations(operation_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE change_log(revision INTEGER PRIMARY KEY, operation_id TEXT NOT NULL, changes_json TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE object_metadata(object_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, content_type TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'COMMITTED', staging_path TEXT, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE error_events(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE diagnostic_runs(id TEXT PRIMARY KEY, report_json TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)")
        db.insertOrThrow("schema_migrations", null, ContentValues().apply {
            put("version", DATABASE_VERSION); put("name", "initial-data-node-schema-v2"); put("applied_at", System.currentTimeMillis())
        })
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE object_metadata ADD COLUMN state TEXT NOT NULL DEFAULT 'COMMITTED'")
            db.execSQL("ALTER TABLE object_metadata ADD COLUMN staging_path TEXT")
            db.execSQL("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)")
            db.insertOrThrow("schema_migrations", null, ContentValues().apply {
                put("version", oldVersion); put("name", "legacy-schema-v$oldVersion"); put("applied_at", System.currentTimeMillis())
            })
            db.insertOrThrow("schema_migrations", null, ContentValues().apply {
                put("version", 2); put("name", "object-store-recovery-state"); put("applied_at", System.currentTimeMillis())
            })
        }
        if (newVersion > DATABASE_VERSION) error("No migration path from schema $oldVersion to $newVersion")
    }

    fun apply(operationId: String, mutations: List<Mutation>): CommitResult {
        require(operationId.isNotBlank())
        require(mutations.isNotEmpty())
        require(mutations.size <= 100)
        mutations.forEach {
            require(it.namespace.isNotBlank() && it.namespace.length <= 128)
            require(it.key.isNotBlank() && it.key.length <= 512)
            require(it.value.toByteArray(Charsets.UTF_8).size <= 1_048_576)
        }
        val request = JSONObject().put("mutations", org.json.JSONArray().also { array ->
            mutations.forEach { m ->
                array.put(JSONObject().put("namespace", m.namespace).put("key", m.key).put("value", m.value).put("expectedVersion", m.expectedVersion ?: JSONObject.NULL))
            }
        }).toString()
        val requestHash = sha256(request.toByteArray(Charsets.UTF_8))
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.rawQuery("SELECT request_hash, revision FROM operations WHERE operation_id = ?", arrayOf(operationId)).use { c ->
                if (c.moveToFirst()) {
                    if (c.getString(0) != requestHash) throw IdempotencyConflict("operationId was already used with a different request")
                    val result = CommitResult(c.getLong(1), true)
                    db.setTransactionSuccessful()
                    return result
                }
            }
            for (m in mutations) {
                db.rawQuery("SELECT version FROM records WHERE namespace = ? AND record_key = ?", arrayOf(m.namespace, m.key)).use { c ->
                    val actual = if (c.moveToFirst()) c.getLong(0) else 0L
                    if (m.expectedVersion != null && m.expectedVersion != actual) {
                        throw VersionConflict("expected version ${m.expectedVersion}, found $actual for ${m.namespace}/${m.key}")
                    }
                }
            }
            val revision = db.rawQuery("SELECT COALESCE(MAX(revision), 0) + 1 FROM change_log", null).use { c -> c.moveToFirst(); c.getLong(0) }
            val now = System.currentTimeMillis()
            mutations.forEach { m ->
                val oldVersion = db.rawQuery("SELECT version FROM records WHERE namespace = ? AND record_key = ?", arrayOf(m.namespace, m.key)).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
                val values = ContentValues().apply {
                    put("namespace", m.namespace); put("record_key", m.key); put("value_json", m.value)
                    put("version", oldVersion + 1); put("updated_at", now)
                }
                db.insertWithOnConflict("records", null, values, SQLiteDatabase.CONFLICT_REPLACE)
            }
            val resultJson = JSONObject().put("revision", revision).put("changedRecords", mutations.size).toString()
            db.insertOrThrow("operations", null, ContentValues().apply {
                put("operation_id", operationId); put("request_hash", requestHash); put("revision", revision)
                put("result_json", resultJson); put("created_at", now)
            })
            db.insertOrThrow("change_log", null, ContentValues().apply {
                put("revision", revision); put("operation_id", operationId); put("changes_json", request); put("created_at", now)
            })
            db.setTransactionSuccessful()
            return CommitResult(revision, false)
        } finally {
            db.endTransaction()
        }
    }

    fun read(namespace: String, key: String): Pair<String, Long>? = readableDatabase.rawQuery(
        "SELECT value_json, version FROM records WHERE namespace = ? AND record_key = ?", arrayOf(namespace, key),
    ).use { c -> if (c.moveToFirst()) c.getString(0) to c.getLong(1) else null }

    fun putObject(bytes: ByteArray, contentType: String): String = writeObject(bytes, contentType, null)

    fun injectObjectCrashForTest(bytes: ByteArray, contentType: String, point: ObjectCrashPoint): String =
        writeObject(bytes, contentType, point)

    private fun writeObject(bytes: ByteArray, contentType: String, crashPoint: ObjectCrashPoint?): String = synchronized(objectLock) {
        require(bytes.size <= 16 * 1024 * 1024) { "Local prototype object limit is 16 MiB" }
        require(contentType.isNotBlank() && contentType.length <= 255) { "Invalid content type" }
        val digest = sha256(bytes)
        val finalFile = objectFile(digest)
        val db = writableDatabase
        db.rawQuery("SELECT state FROM object_metadata WHERE object_id = ?", arrayOf(digest)).use { c ->
            if (c.moveToFirst() && c.getString(0) == STATE_COMMITTED) {
                val existing = readAndVerifyObject(digest, digest, bytes.size.toLong())
                if (existing != null) return@synchronized digest
            }
        }
        val temp = File(staging, "$digest-${UUID.randomUUID()}.part")
        db.insertWithOnConflict("object_metadata", null, ContentValues().apply {
            put("object_id", digest); put("sha256", digest); put("byte_size", bytes.size.toLong())
            put("content_type", contentType); put("state", STATE_PREPARING); put("staging_path", temp.absolutePath)
            put("created_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
        FileOutputStream(temp).use { out -> out.write(bytes); out.fd.sync() }
        if (crashPoint == ObjectCrashPoint.AFTER_STAGING_SYNC) return@synchronized digest
        finalFile.parentFile?.mkdirs()
        if (!temp.renameTo(finalFile)) {
            if (!finalFile.exists()) throw IllegalStateException("Could not publish object file")
            temp.delete()
        }
        syncDirectory(finalFile.parentFile ?: error("Object directory missing"))
        if (crashPoint == ObjectCrashPoint.AFTER_PUBLISH) return@synchronized digest
        db.update("object_metadata", ContentValues().apply {
            put("state", STATE_COMMITTED); putNull("staging_path")
        }, "object_id = ?", arrayOf(digest))
        digest
    }

    fun getObject(objectId: String): ByteArray? {
        require(OBJECT_ID_PATTERN.matches(objectId)) { "objectId must be a lowercase SHA-256 digest" }
        val row = readableDatabase.rawQuery("SELECT sha256, byte_size, state FROM object_metadata WHERE object_id = ?", arrayOf(objectId)).use { c ->
            if (c.moveToFirst()) Triple(c.getString(0), c.getLong(1), c.getString(2)) else null
        } ?: return null
        if (row.third != STATE_COMMITTED) throw ObjectUnavailable("Object is not readable in state ${row.third}")
        val bytes = readAndVerifyObject(objectId, row.first, row.second) ?: run {
            markObjectState(objectId, STATE_MISSING)
            recordError("OBJECT_MISSING", "Committed object file is missing: $objectId")
            throw ObjectUnavailable("Committed object file is missing")
        }
        return bytes
    }

    fun objectDigest(bytes: ByteArray): String = sha256(bytes)

    fun integrityCheck(): String = readableDatabase.rawQuery("PRAGMA integrity_check", null).use { c -> c.moveToFirst(); c.getString(0) }

    fun schemaVersion(): Int = readableDatabase.rawQuery("PRAGMA user_version", null).use { c -> c.moveToFirst(); c.getInt(0) }

    fun migrationApplied(version: Int): Boolean = readableDatabase.rawQuery(
        "SELECT 1 FROM schema_migrations WHERE version = ?", arrayOf(version.toString()),
    ).use { it.moveToFirst() }

    fun recoverStorage(): JSONObject = synchronized(objectLock) {
        val db = writableDatabase
        val report = JSONObject().put("schemaVersion", schemaVersion())
            .put("pendingCommitted", 0).put("abandonedUploads", 0).put("missingObjects", 0)
            .put("corruptObjects", 0).put("stagingFilesRemoved", 0)
        val pending = mutableListOf<Triple<String, Long, String?>>()
        db.rawQuery("SELECT object_id, byte_size, staging_path FROM object_metadata WHERE state = ?", arrayOf(STATE_PREPARING)).use { c ->
            while (c.moveToNext()) pending += Triple(c.getString(0), c.getLong(1), if (c.isNull(2)) null else c.getString(2))
        }
        pending.forEach { (id, expectedSize, stagingPath) ->
            val final = objectFile(id)
            if (final.isFile && verifyFile(final, id, expectedSize)) {
                markObjectState(id, STATE_COMMITTED)
                report.put("pendingCommitted", report.getInt("pendingCommitted") + 1)
            } else if (final.exists()) {
                markObjectState(id, STATE_CORRUPT)
                report.put("corruptObjects", report.getInt("corruptObjects") + 1)
                recordError("RECOVERY_HASH_MISMATCH", "Pending object failed verification: $id")
            } else {
                if (stagingPath != null && File(stagingPath).parentFile == staging) File(stagingPath).delete()
                db.delete("object_metadata", "object_id = ? AND state = ?", arrayOf(id, STATE_PREPARING))
                report.put("abandonedUploads", report.getInt("abandonedUploads") + 1)
            }
        }
        val committed = mutableListOf<Pair<String, Long>>()
        db.rawQuery("SELECT object_id, byte_size FROM object_metadata WHERE state = ?", arrayOf(STATE_COMMITTED)).use { c ->
            while (c.moveToNext()) committed += c.getString(0) to c.getLong(1)
        }
        committed.forEach { (id, size) ->
            val file = objectFile(id)
            if (!file.exists()) {
                markObjectState(id, STATE_MISSING)
                report.put("missingObjects", report.getInt("missingObjects") + 1)
                recordError("OBJECT_MISSING", "Committed object file is missing: $id")
            } else if (!verifyFile(file, id, size)) {
                markObjectState(id, STATE_CORRUPT)
                report.put("corruptObjects", report.getInt("corruptObjects") + 1)
                recordError("OBJECT_HASH_MISMATCH", "Committed object failed verification: $id")
            }
        }
        staging.listFiles()?.forEach { file ->
            if (file.delete()) report.put("stagingFilesRemoved", report.getInt("stagingFilesRemoved") + 1)
        }
        report
    }

    fun objectState(objectId: String): String? = readableDatabase.rawQuery(
        "SELECT state FROM object_metadata WHERE object_id = ?", arrayOf(objectId),
    ).use { c -> if (c.moveToFirst()) c.getString(0) else null }

    fun recordError(code: String, message: String) {
        writableDatabase.insert("error_events", null, ContentValues().apply {
            put("code", code); put("message", message.take(1000)); put("created_at", System.currentTimeMillis())
        })
    }

    fun saveReport(id: String, report: JSONObject) {
        val encoded = report.toString(2)
        writableDatabase.insert("diagnostic_runs", null, ContentValues().apply {
            put("id", id); put("report_json", encoded); put("created_at", System.currentTimeMillis())
        })
        File(root, "latest-diagnostics.json").writeText(encoded)
    }

    fun databasePath(): String = databaseName

    private fun objectFile(id: String) = File(File(objects, id.take(2)), id)

    private fun readAndVerifyObject(id: String, expectedHash: String, expectedSize: Long): ByteArray? {
        val file = objectFile(id)
        if (!file.isFile) return null
        val bytes = FileInputStream(file).use { it.readBytes() }
        if (bytes.size.toLong() != expectedSize) {
            markObjectState(id, STATE_CORRUPT)
            recordError("OBJECT_SIZE_MISMATCH", "Object size mismatch for $id")
            throw ObjectUnavailable("Object size mismatch")
        }
        if (sha256(bytes) != expectedHash) {
            markObjectState(id, STATE_CORRUPT)
            recordError("OBJECT_HASH_MISMATCH", "Object checksum mismatch for $id")
            throw ObjectUnavailable("Object checksum mismatch")
        }
        return bytes
    }

    private fun syncDirectory(directory: File) {
        val descriptor = Os.open(directory.absolutePath, OsConstants.O_RDONLY, 0)
        try {
            Os.fsync(descriptor)
        } finally {
            Os.close(descriptor)
        }
    }

    private fun verifyFile(file: File, expectedHash: String, expectedSize: Long): Boolean {
        if (!file.isFile || file.length() != expectedSize) return false
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        return actual == expectedHash
    }

    private fun markObjectState(id: String, state: String) {
        writableDatabase.update("object_metadata", ContentValues().apply { put("state", state); putNull("staging_path") }, "object_id = ?", arrayOf(id))
    }

    companion object {
        const val DATABASE_VERSION = 2
        const val STATE_PREPARING = "PREPARING"
        const val STATE_COMMITTED = "COMMITTED"
        const val STATE_MISSING = "MISSING"
        const val STATE_CORRUPT = "CORRUPT"
        private val OBJECT_ID_PATTERN = Regex("[a-f0-9]{64}")
        private val objectLock = Any()
        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
