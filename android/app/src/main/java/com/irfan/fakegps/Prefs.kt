package com.irfan.fakegps

import android.content.Context

object Prefs {
    private const val P = "fakegps"

    fun token(ctx: Context): String? =
        ctx.getSharedPreferences(P, Context.MODE_PRIVATE).getString("token", null)

    fun setToken(ctx: Context, token: String?) {
        ctx.getSharedPreferences(P, Context.MODE_PRIVATE)
            .edit().putString("token", token).apply()
    }

    fun clear(ctx: Context) {
        ctx.getSharedPreferences(P, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
