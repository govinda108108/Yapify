package com.jgil303.yapify

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class YapifyAccessibilityService : AccessibilityService() {

    companion object {
        var instance: YapifyAccessibilityService? = null
        private var lastNode: AccessibilityNodeInfo? = null

        fun hasActiveField(): Boolean = lastNode != null

        fun injectText(text: String): Boolean {
            val node = lastNode ?: return false
            // Paste at cursor position via clipboard
            return try {
                val clipboard = instance?.getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager
                    ?: return false
                clipboard.setPrimaryClip(ClipData.newPlainText("yapify", text))
                node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            } catch (e: Exception) {
                false
            }
        }
    }

    override fun onServiceConnected() {
        instance = this
        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPE_VIEW_FOCUSED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_VIEW_FOCUSED) return
        val source = event.source ?: return
        // Only track editable fields outside Yapify
        if (source.isEditable && event.packageName?.toString() != packageName) {
            lastNode?.recycle()
            lastNode = AccessibilityNodeInfo.obtain(source)
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        lastNode?.recycle()
        lastNode = null
        super.onDestroy()
    }
}
