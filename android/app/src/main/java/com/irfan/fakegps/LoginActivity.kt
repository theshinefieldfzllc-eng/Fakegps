package com.irfan.fakegps

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class LoginActivity : AppCompatActivity() {

    private lateinit var emailEt: EditText
    private lateinit var passEt: EditText
    private lateinit var btn: Button
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        emailEt = findViewById(R.id.email)
        passEt = findViewById(R.id.password)
        btn = findViewById(R.id.loginBtn)
        status = findViewById(R.id.status)

        // Agar pehle se token hai to subscription check kar ke seedha map khol do
        val existing = Prefs.token(this)
        if (existing != null) {
            status.text = "Checking subscription…"
            ApiClient.status(existing) { r ->
                runOnUiThread {
                    if (r.ok && r.body?.optBoolean("active") == true) {
                        goToMap()
                    } else {
                        status.text = ""
                    }
                }
            }
        }

        btn.setOnClickListener { doLogin() }

        // Naya user? App ke andar se subscribe (payment) -> login email aa jayegi.
        findViewById<Button>(R.id.subscribeBtn).setOnClickListener {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ApiClient.BASE_URL + "/")))
            } catch (e: Exception) {
                Toast.makeText(this, "Browser nahi khula", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun doLogin() {
        val email = emailEt.text.toString().trim()
        val pass = passEt.text.toString()
        if (email.isEmpty() || pass.isEmpty()) {
            Toast.makeText(this, "Email aur password daalein", Toast.LENGTH_SHORT).show()
            return
        }
        btn.isEnabled = false
        status.text = "Logging in…"
        ApiClient.login(email, pass) { r ->
            runOnUiThread {
                btn.isEnabled = true
                if (r.ok) {
                    val token = r.body?.optString("token")
                    val active = r.body?.optBoolean("active") == true
                    if (token.isNullOrEmpty()) {
                        status.text = "Login error"
                        return@runOnUiThread
                    }
                    Prefs.setToken(this, token)
                    if (active) goToMap()
                    else status.text = "Aapki subscription active nahi hai."
                } else {
                    status.text = when (r.error) {
                        "invalid_login" -> "Email ya password galat hai."
                        "missing_fields" -> "Email aur password daalein."
                        else -> "Error: ${r.error}"
                    }
                }
            }
        }
    }

    private fun goToMap() {
        startActivity(Intent(this, MapActivity::class.java))
        finish()
    }
}
