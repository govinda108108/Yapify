package com.jgil303.yapify

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ClipboardModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "ClipboardModule"

    @ReactMethod
    fun copyText(text: String, promise: Promise) {
        val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        if (clipboard == null) {
            promise.resolve(false)
            return
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("yapify", text))
        promise.resolve(true)
    }
}
