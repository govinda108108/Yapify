package com.jgil303.yapify

import android.content.Context

object ApiKeyStore {
    private const val PREFS = "yapify_prefs"
    private const val API_KEY = "api_key"
    private const val GLOBAL_PROMPT = "global_prompt"
    private const val SELECTED_MODE = "selected_mode"
    private const val SHOW_ONLY_DURING_TEXT_INPUT = "show_only_during_text_input"

    fun getKey(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(API_KEY, null)?.takeIf { it.isNotBlank() }

    fun setKey(ctx: Context, key: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(API_KEY, key).apply()
    }

    fun getGlobalPrompt(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(GLOBAL_PROMPT, null)?.takeIf { it.isNotBlank() }

    fun setGlobalPrompt(ctx: Context, prompt: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(GLOBAL_PROMPT, prompt).apply()
    }

    fun getSelectedMode(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(SELECTED_MODE, null)?.takeIf { it.isNotBlank() }

    fun setSelectedMode(ctx: Context, modeId: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(SELECTED_MODE, modeId).apply()
    }

    fun getShowOnlyDuringTextInput(ctx: Context): Boolean =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(SHOW_ONLY_DURING_TEXT_INPUT, false)

    fun setShowOnlyDuringTextInput(ctx: Context, enabled: Boolean) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(SHOW_ONLY_DURING_TEXT_INPUT, enabled).apply()
    }

    fun getModePrompt(ctx: Context, modeId: String, fallback: String): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("mode_prompt_$modeId", null)?.takeIf { it.isNotBlank() } ?: fallback

    fun setModePrompt(ctx: Context, modeId: String, prompt: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString("mode_prompt_$modeId", prompt).apply()
    }
}
