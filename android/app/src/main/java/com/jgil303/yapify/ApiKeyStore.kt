package com.jgil303.yapify

import android.content.Context

object ApiKeyStore {
    private const val PREFS = "yapify_prefs"
    private const val KEY = "api_key"

    fun getKey(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, null)?.takeIf { it.isNotBlank() }

    fun setKey(ctx: Context, key: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY, key).apply()
    }
}
