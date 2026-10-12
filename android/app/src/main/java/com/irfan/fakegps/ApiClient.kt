package com.irfan.fakegps

import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

object ApiClient {

    // ============================================================
    //  IMPORTANT: Yahan apni backend URL daalein (Render se milegi).
    //  Trailing slash NAHI. Example: "https://fakegps-backend.onrender.com"
    // ============================================================
    const val BASE_URL = "https://fakegps-backend.onrender.com"

    private val client = OkHttpClient()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    data class Result(val ok: Boolean, val body: JSONObject?, val error: String?)

    fun login(email: String, password: String, cb: (Result) -> Unit) {
        val payload = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()
        val req = Request.Builder()
            .url("$BASE_URL/api/login")
            .post(payload.toRequestBody(JSON))
            .build()
        enqueue(req, cb)
    }

    fun status(token: String, cb: (Result) -> Unit) {
        val req = Request.Builder()
            .url("$BASE_URL/api/status")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        enqueue(req, cb)
    }

    private fun enqueue(req: Request, cb: (Result) -> Unit) {
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                cb(Result(false, null, e.message ?: "network_error"))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val text = it.body?.string() ?: "{}"
                    val json = try { JSONObject(text) } catch (e: Exception) { JSONObject() }
                    if (it.isSuccessful) {
                        cb(Result(true, json, null))
                    } else {
                        cb(Result(false, json, json.optString("error", "http_${it.code}")))
                    }
                }
            }
        })
    }
}
