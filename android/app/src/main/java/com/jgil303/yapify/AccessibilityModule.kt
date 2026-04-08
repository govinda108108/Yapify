package com.jgil303.yapify

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AccessibilityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AccessibilityModule"

    @ReactMethod
    fun isEnabled(promise: Promise) {
        promise.resolve(YapifyAccessibilityService.instance != null)
    }

    @ReactMethod
    fun hasActiveField(promise: Promise) {
        promise.resolve(YapifyAccessibilityService.hasActiveField())
    }

    @ReactMethod
    fun injectText(text: String, promise: Promise) {
        promise.resolve(YapifyAccessibilityService.injectText(text))
    }

    @ReactMethod
    fun openSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
