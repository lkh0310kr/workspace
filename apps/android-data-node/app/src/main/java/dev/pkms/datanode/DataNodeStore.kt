package dev.pkms.datanode

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
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

internal class DataNodeStore(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    File(context.filesDir, "data-node/node.sqlite").apply { parentFile?.mkdirs() }.absolutePath,
    null,
    1,
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
        db.execSQL("CREATE TABLE object_metadata(object_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, content_type TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE error_events(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE diagnostic_runs(id TEXT PRIMARY KEY, report_json TEXT NOT NULL, created_at INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        error("No migration path from schema $oldVersion to $newVersion")
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

    fun putObject(bytes: ByteArray, contentType: String): String {
        require(bytes.size <= 16 * 1024 * 1024) { "Local prototype object limit is 16 MiB" }
        val digest = sha256(bytes)
        val finalFile = objectFile(digest)
        if (!finalFile.exists()) {
            val temp = File(staging, "${UUID.randomUUID()}.part")
            FileOutputStream(temp).use { out -> out.write(bytes); out.fd.sync() }
            finalFile.parentFile?.mkdirs()
            if (!temp.renameTo(finalFile)) {
                temp.delete()
                if (!finalFile.exists()) throw IllegalStateException("Could not publish object file")
            }
        }
        writableDatabase.insertWithOnConflict("object_metadata", null, ContentValues().apply {
            put("object_id", digest); put("sha256", digest); put("byte_size", bytes.size.toLong())
            put("content_type", contentType); put("created_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
        return digest
    }

    fun getObject(objectId: String): ByteArray? {
        require(OBJECT_ID_PATTERN.matches(objectId)) { "objectId must be a lowercase SHA-256 digest" }
        val known = readableDatabase.rawQuery("SELECT sha256 FROM object_metadata WHERE object_id = ?", arrayOf(objectId)).use { it.moveToFirst() }
        if (!known) return null
        val file = objectFile(objectId)
        if (!file.isFile) return null
        return FileInputStream(file).use { it.readBytes() }
    }

    fun objectDigest(bytes: ByteArray): String = sha256(bytes)

    fun integrityCheck(): String = readableDatabase.rawQuery("PRAGMA integrity_check", null).use { c -> c.moveToFirst(); c.getString(0) }

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

    companion object {
        private val OBJECT_ID_PATTERN = Regex("[a-f0-9]{64}")
        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
