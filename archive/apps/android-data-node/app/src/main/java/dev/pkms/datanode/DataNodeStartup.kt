package dev.pkms.datanode

import android.content.Context
import android.util.Log
import org.json.JSONObject

/** Runs object/SQLite reconciliation once when the Android app process starts. */
internal object DataNodeStartup {
    @Volatile private var complete = false
    @Volatile private var report = JSONObject().put("status", "not_run")
    private const val TAG = "DataNode"

    fun recover(context: Context) {
        if (complete) return
        synchronized(this) {
            if (complete) return
            try {
                DataNodeStore(context).use { store -> report = store.recoverStorage().put("status", "passed") }
                Log.i(TAG, "startup_recovery_passed pending_committed=${report.optInt("pendingCommitted")} abandoned=${report.optInt("abandonedUploads")}")
            } catch (error: Throwable) {
                report = JSONObject().put("status", "failed").put("errorCode", error::class.java.simpleName).put("message", error.message ?: "Startup recovery failed")
                Log.e(TAG, "startup_recovery_failed error_code=${error::class.java.simpleName}", error)
            } finally {
                complete = true
            }
        }
    }

    fun snapshot(): JSONObject = JSONObject(report.toString())
}
