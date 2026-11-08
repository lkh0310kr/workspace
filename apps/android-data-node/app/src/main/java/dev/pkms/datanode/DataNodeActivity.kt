package dev.pkms.datanode

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.util.UUID

class DataNodeActivity : Activity() {
    private lateinit var store: DataNodeStore
    private lateinit var output: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = DataNodeStore(this)
        output = TextView(this).apply { textSize = 15f; setPadding(24, 20, 24, 12); text = "Android Data Node local prototype\n" }
        val run = Button(this).apply {
            text = "Run local verification"
            setOnClickListener { runVerification("manual") }
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(output, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(run, LinearLayout.LayoutParams(-1, -2))
        }
        setContentView(ScrollView(this).apply { addView(layout) })
        val mode = intent.getStringExtra("mode")
        if (mode != null) runVerification(mode)
    }

    private fun runVerification(mode: String) {
        val runId = intent.getStringExtra("run_id") ?: "manual-${UUID.randomUUID()}"
        val report = JSONObject().put("schemaVersion", 1).put("runId", runId).put("mode", mode)
            .put("device", android.os.Build.MODEL).put("sdk", android.os.Build.VERSION.SDK_INT)
            .put("databaseVersion", store.schemaVersion()).put("migratedFromVersionOne", store.migrationApplied(1))
            .put("startupRecovery", DataNodeStartup.snapshot())
            .put("checks", org.json.JSONArray()).put("startedAt", System.currentTimeMillis())
        val checks = report.getJSONArray("checks")
        fun check(name: String, action: () -> Unit) {
            val started = System.nanoTime()
            try {
                action()
                checks.put(JSONObject().put("name", name).put("status", "passed").put("durationMs", (System.nanoTime() - started) / 1_000_000))
                Log.i(TAG, "check_passed name=$name run_id=$runId")
            } catch (error: Throwable) {
                val code = error::class.java.simpleName.ifBlank { "UNKNOWN" }
                store.recordError(code, error.message ?: code)
                checks.put(JSONObject().put("name", name).put("status", "failed").put("errorCode", code).put("message", error.message ?: code))
                Log.e(TAG, "check_failed name=$name run_id=$runId error_code=$code", error)
            }
        }
        try {
            if (mode == "restart") {
                check("startup_recovery_succeeded") {
                    val recovery = DataNodeStartup.snapshot()
                    require(recovery.optString("status") == "passed") { "Startup recovery did not pass: $recovery" }
                    require(recovery.optInt("pendingCommitted") >= 1) { "Published pending object was not committed by recovery: $recovery" }
                    require(recovery.optInt("abandonedUploads") >= 1) { "Staging-only upload was not discarded by recovery: $recovery" }
                }
                check("sqlite_integrity") { require(store.integrityCheck() == "ok") { "SQLite integrity check was not ok" } }
                check("process_restart_records") {
                    require(store.read(PERSIST_NS, "record-a")?.first == "{\"value\":\"alpha\"}") { "Persisted record A missing" }
                    require(store.read(PERSIST_NS, "record-b")?.first == "{\"value\":\"beta\"}") { "Persisted record B missing" }
                }
                check("process_restart_object") {
                    val expected = "offline-data-node-object-v1".toByteArray()
                    val id = store.objectDigest(expected)
                    val stored = store.getObject(id) ?: error("Persisted object missing")
                    require(stored.contentEquals(expected) && store.objectDigest(stored) == id) { "Persisted object hash mismatch" }
                }
                check("recovery_commits_published_object") {
                    val expected = "recovery-published:$runId".toByteArray()
                    val id = store.objectDigest(expected)
                    val stored = store.getObject(id) ?: error("Published pending object was not readable after recovery")
                    require(stored.contentEquals(expected)) { "Recovered object payload differs" }
                }
                check("recovery_discards_staging_only_upload") {
                    val expected = "recovery-staging:$runId".toByteArray()
                    val id = store.objectDigest(expected)
                    require(store.objectState(id) == null && store.getObject(id) == null) { "Unpublished upload became visible after recovery" }
                }
                check("adb_command_record_persistence") {
                    val namespace = "adb-e2e-$runId"
                    val expected = JSONObject().put("source", "adb").put("runId", runId).toString()
                    require(store.read(namespace, "record")?.first == expected) { "ADB-written record missing after process restart" }
                    require(store.read(namespace, "record-b")?.first == "{\"index\":2}") { "Second ADB-written record missing after process restart" }
                }
                check("adb_command_object_persistence") {
                    val expected = "adb-object:$runId".toByteArray()
                    val id = store.objectDigest(expected)
                    val stored = store.getObject(id) ?: error("ADB-written object missing after process restart")
                    require(stored.contentEquals(expected) && store.objectDigest(stored) == id) { "ADB-written object hash mismatch after process restart" }
                }
            } else {
                check("schema_migration_v2") {
                    require(store.schemaVersion() == DataNodeStore.DATABASE_VERSION) { "Unexpected SQLite schema version ${store.schemaVersion()}" }
                    require(store.migrationApplied(DataNodeStore.DATABASE_VERSION)) { "Schema migration audit row is missing" }
                }
                check("schema_migration_preserves_existing_data") {
                    if (store.migrationApplied(1)) {
                        require(store.read(PERSIST_NS, "record-a")?.first == "{\"value\":\"alpha\"}") { "Legacy record was lost during migration" }
                        val previousObject = "offline-data-node-object-v1".toByteArray()
                        require(store.getObject(store.objectDigest(previousObject))?.contentEquals(previousObject) == true) { "Legacy object was lost during migration" }
                    }
                }
                check("sqlite_integrity_before") { require(store.integrityCheck() == "ok") { "SQLite integrity check was not ok" } }
                check("atomic_transaction_and_revision") {
                    val result = store.apply("$runId-batch", listOf(
                        Mutation(PERSIST_NS, "record-a", "{\"value\":\"alpha\"}"),
                        Mutation(PERSIST_NS, "record-b", "{\"value\":\"beta\"}"),
                    ))
                    require(!result.replayed && result.revision > 0)
                    require((store.read(PERSIST_NS, "record-a")?.second ?: 0L) >= 1L && (store.read(PERSIST_NS, "record-b")?.second ?: 0L) >= 1L)
                }
                check("idempotent_retry") {
                    val mutations = listOf(Mutation("diag-$runId", "retry", "{\"ok\":true}"))
                    val first = store.apply("$runId-idempotent", mutations)
                    val retry = store.apply("$runId-idempotent", mutations)
                    require(first.revision == retry.revision && !first.replayed && retry.replayed)
                }
                check("idempotency_payload_conflict") {
                    try {
                        store.apply("$runId-idempotent", listOf(Mutation("diag-$runId", "retry", "{\"ok\":false}")))
                        error("Mismatched idempotency payload was accepted")
                    } catch (_: IdempotencyConflict) { }
                }
                check("transaction_rollback_on_version_conflict") {
                    try {
                        store.apply("$runId-rollback", listOf(
                            Mutation("diag-$runId", "must-rollback", "{\"written\":true}"),
                            Mutation("diag-$runId", "guard", "{\"x\":1}", expectedVersion = 99),
                        ))
                        error("Expected version conflict was not raised")
                    } catch (_: VersionConflict) { }
                    require(store.read("diag-$runId", "must-rollback") == null) { "Partial write escaped transaction rollback" }
                }
                check("object_store_write_read_dedup") {
                    val payload = "offline-data-node-object-v1".toByteArray()
                    val id = store.putObject(payload, "application/octet-stream")
                    require(id == store.objectDigest(payload))
                    require(store.getObject(id)?.contentEquals(payload) == true)
                    require(store.putObject(payload, "application/octet-stream") == id) { "Content-addressed dedup failed" }
                }
                check("sqlite_integrity_after") { require(store.integrityCheck() == "ok") { "SQLite integrity check was not ok" } }
            }
        } catch (error: Throwable) {
            store.recordError(error::class.java.simpleName, error.message ?: "Unhandled verification error")
            checks.put(JSONObject().put("name", "verification_harness").put("status", "failed").put("message", error.message ?: "Unhandled error"))
        }
        val failed = (0 until checks.length()).map { checks.getJSONObject(it) }.any { it.optString("status") != "passed" }
        report.put("status", if (failed) "failed" else "passed")
            .put("finishedAt", System.currentTimeMillis())
            .put("databasePath", store.databasePath())
            .put("checkCount", checks.length())
        store.saveReport(runId, report)
        output.text = "Android Data Node local verification\n\n${report.toString(2)}\n"
        Log.i(TAG, "verification_finished status=${report.getString("status")} run_id=$runId")
    }

    override fun onDestroy() {
        if (::store.isInitialized) store.close()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "DataNode"
        private const val PERSIST_NS = "local-verification-fixture"
    }
}
