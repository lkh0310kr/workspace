package dev.pkms.datanode

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.util.Log
import org.json.JSONObject

/** ADB-only local command bridge, protected by the system DUMP permission. */
class DataNodeProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        val store = DataNodeStore(requireNotNull(context))
        return try {
            val payload = arg?.let { JSONObject(String(Base64.decode(it, Base64.NO_WRAP), Charsets.UTF_8)) } ?: JSONObject()
            val result = when (method) {
                "health" -> JSONObject()
                    .put("ok", true)
                    .put("integrity", store.integrityCheck())
                    .put("device", android.os.Build.MODEL)
                    .put("sdk", android.os.Build.VERSION.SDK_INT)

                "record.put" -> {
                    val mutation = Mutation(
                        namespace = payload.getString("namespace"),
                        key = payload.getString("key"),
                        value = payload.getString("value"),
                        expectedVersion = if (payload.isNull("expectedVersion")) null else payload.getLong("expectedVersion"),
                    )
                    val commit = store.apply(payload.getString("operationId"), listOf(mutation))
                    val current = store.read(mutation.namespace, mutation.key)
                    JSONObject().put("ok", true).put("revision", commit.revision).put("replayed", commit.replayed)
                        .put("version", current?.second ?: JSONObject.NULL)
                }

                "record.batch" -> {
                    val input = payload.getJSONArray("mutations")
                    val mutations = (0 until input.length()).map { index ->
                        val item = input.getJSONObject(index)
                        Mutation(
                            namespace = item.getString("namespace"),
                            key = item.getString("key"),
                            value = item.getString("value"),
                            expectedVersion = if (item.isNull("expectedVersion")) null else item.getLong("expectedVersion"),
                        )
                    }
                    val commit = store.apply(payload.getString("operationId"), mutations)
                    JSONObject().put("ok", true).put("revision", commit.revision).put("replayed", commit.replayed)
                        .put("changedRecords", mutations.size)
                }

                "record.get" -> {
                    val row = store.read(payload.getString("namespace"), payload.getString("key"))
                    if (row == null) JSONObject().put("ok", true).put("found", false)
                    else JSONObject().put("ok", true).put("found", true).put("value", row.first).put("version", row.second)
                }

                "object.put" -> {
                    val bytes = Base64.decode(payload.getString("bytesBase64"), Base64.NO_WRAP)
                    val contentType = payload.optString("contentType", "application/octet-stream")
                    val objectId = store.putObject(bytes, contentType)
                    JSONObject().put("ok", true).put("objectId", objectId).put("byteSize", bytes.size).put("sha256", store.objectDigest(bytes))
                }

                "object.get" -> {
                    val objectId = payload.getString("objectId")
                    val bytes = store.getObject(objectId)
                    if (bytes == null) JSONObject().put("ok", true).put("found", false)
                    else JSONObject().put("ok", true).put("found", true).put("bytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                        .put("byteSize", bytes.size).put("sha256", store.objectDigest(bytes))
                }

                else -> throw IllegalArgumentException("Unknown local command")
            }
            Bundle().apply { putString("result", Base64.encodeToString(result.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)) }
        } catch (error: Throwable) {
            val code = error::class.java.simpleName.ifBlank { "UNKNOWN" }
            val expectedRequestFailure = error is VersionConflict || error is IdempotencyConflict || error is IllegalArgumentException
            if (expectedRequestFailure) {
                Log.w(TAG, "local_command_rejected method=$method error_code=$code")
            } else {
                store.recordError(code, error.message ?: code)
                Log.e(TAG, "local_command_failed method=$method error_code=$code", error)
            }
            val failure = JSONObject().put("ok", false).put("errorCode", code).put("message", error.message ?: code)
            Bundle().apply { putString("result", Base64.encodeToString(failure.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)) }
        } finally {
            store.close()
        }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? =
        throw UnsupportedOperationException("Use the protected call interface")

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException("Use the protected call interface")

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException("Use the protected call interface")

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException("Use the protected call interface")

    companion object {
        private const val TAG = "DataNode"
    }
}
