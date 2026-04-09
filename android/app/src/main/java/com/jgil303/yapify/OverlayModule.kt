package com.jgil303.yapify

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "OverlayModule"

    @ReactMethod
    fun hasPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactContext))
    }

    @ReactMethod
    fun requestPermission() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactContext.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun startOverlay(promise: Promise) {
        if (!Settings.canDrawOverlays(reactContext)) {
            promise.reject("NO_PERMISSION", "SYSTEM_ALERT_WINDOW permission not granted")
            return
        }
        val intent = Intent(reactContext, OverlayService::class.java)
        reactContext.startForegroundService(intent)
        promise.resolve(null)
    }

    @ReactMethod
    fun stopOverlay() {
        reactContext.stopService(Intent(reactContext, OverlayService::class.java))
    }

    @ReactMethod
    fun saveApiKey(key: String) {
        ApiKeyStore.setKey(reactContext, key)
    }
}
